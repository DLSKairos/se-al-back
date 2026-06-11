import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validateMagicBytes } from '../common/utils/magic-bytes.util';
import Anthropic from '@anthropic-ai/sdk';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { FileStorageService } from './file-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { mapAiTypeToDB } from './field-type.map';
import {
  EXTRACT_SYSTEM_PROMPT,
  EXTRACT_USER_PROMPT,
  GENERATE_SYSTEM_PROMPT,
  GENERATE_USER_PROMPT,
  ASSIST_SYSTEM_PROMPT,
} from './ai-prompts.constants';
import { GenerateFromDescriptionDto } from './dto/generate-from-description.dto';
import { AiAssistDto } from './dto/ai-assist.dto';

@Injectable()
export class FormAiService {
  private readonly logger = new Logger(FormAiService.name);
  private readonly anthropic: Anthropic;

  constructor(
    private readonly fileStorage: FileStorageService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.anthropic = new Anthropic({
      apiKey: this.config.getOrThrow<string>('ANTHROPIC_API_KEY'),
    });
  }

  // ─── Extracción desde archivo ──────────────────────────────────────────────

  async extractFromFile(file: Express.Multer.File) {
    // Validar magic bytes (Fix #9)
    validateMagicBytes(file.buffer, file.mimetype);

    let sourceFileUrl = '';

    try {
      sourceFileUrl = await this.fileStorage.upload(
        file.buffer,
        file.originalname,
        file.mimetype,
      );
    } catch {
      // Si falla el upload, continuamos sin URL
    }

    try {
      const text = await this.extractText(file);
      if (!text.trim()) throw new Error('Documento vacío');
      this.logger.debug(`Texto extraído: ${text.length} chars`);

      const userPrompt = EXTRACT_USER_PROMPT.replace('{TEXTO_DEL_DOCUMENTO}', text.slice(0, 15000));

      this.logger.debug('Llamando a Claude para extracción...');
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8096,
        system: EXTRACT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const raw = (response.content[0] as { text: string }).text.trim();
      const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(jsonStr);
      const fields = (parsed.fields ?? []).map((f: any) => ({
        ...f,
        type: mapAiTypeToDB(f.type),
        options: f.options ?? null,
      }));

      return {
        fields,
        source_filename: file.originalname,
        source_file_url: sourceFileUrl,
        aiError: false,
      };
    } catch (err) {
      this.logger.error(`Error en extractFromFile: ${(err as Error).message}`);
      return {
        fields: [],
        source_filename: file.originalname,
        source_file_url: sourceFileUrl,
        aiError: true,
      };
    }
  }

  // ─── Generación desde descripción ─────────────────────────────────────────

  async generateFromDescription(dto: GenerateFromDescriptionDto) {
    try {
      const userPrompt = GENERATE_USER_PROMPT
        .replace('{DESCRIPCION}', dto.description)
        .replace('{COLUMNAS}', String(dto.columns))
        .replace('{OBSERVACIONES_POR_SECCION}', String(dto.observationsPerSection));

      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8096,
        system: GENERATE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const raw = (response.content[0] as { text: string }).text.trim();
      const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(jsonStr);

      const sections = (parsed.sections ?? []).map((sec: any) => ({
        id: crypto.randomUUID(),
        name: sec.name ?? 'General',
        hasObservations: sec.hasObservations ?? false,
        fields: (sec.fields ?? []).map((f: any) => ({
          id: crypto.randomUUID(),
          label: f.label,
          key: f.key,
          type: mapAiTypeToDB(f.type),
          required: f.required ?? false,
          options: f.options ?? undefined,
          placeholder: f.placeholder ?? undefined,
        })),
      }));

      return { name: parsed.name ?? dto.description.slice(0, 60), sections, aiError: false };
    } catch {
      return {
        name: dto.description.slice(0, 60),
        sections: [{ id: crypto.randomUUID(), name: 'General', hasObservations: false, fields: [] }],
        aiError: true,
      };
    }
  }

  // ─── Asistente del editor ──────────────────────────────────────────────────

  async assist(dto: AiAssistDto) {
    try {
      const contextJson = JSON.stringify(dto.currentSections, null, 2).slice(0, 8000);
      const userPrompt = `Estado actual del formulario:\n${contextJson}\n\nSolicitud del usuario: ${dto.message}`;

      const response = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 2048,
        system: ASSIST_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const raw = (response.content[0] as { text: string }).text.trim();
      const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      return JSON.parse(jsonStr);
    } catch {
      return {
        action: 'none',
        payload: null,
        aiError: true,
        message: 'No pude procesar tu solicitud. Intenta de nuevo.',
      };
    }
  }

  // ─── Admin Chat ───────────────────────────────────────────────────────────

  async adminChat(
    orgId: string,
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
  ) {
    try {
      const [
        totalUsers,
        activeUsers,
        statusCounts,
        activeTemplates,
        recentSubmissions,
      ] = await Promise.all([
        this.prisma.user.count({ where: { org_id: orgId } }),
        this.prisma.user.count({ where: { org_id: orgId, is_active: true } }),
        this.prisma.formSubmission.groupBy({
          by: ['status'],
          where: { org_id: orgId },
          _count: { status: true },
        }),
        this.prisma.formTemplate.findMany({
          where: { org_id: orgId, status: 'ACTIVE' },
          select: { id: true, name: true, category: { select: { name: true } } },
        }),
        this.prisma.formSubmission.findMany({
          where: { org_id: orgId },
          orderBy: { submitted_at: 'desc' },
          take: 5,
          select: {
            id: true,
            status: true,
            submitted_at: true,
            submitter: { select: { name: true } },
            template: { select: { name: true } },
          },
        }),
      ]);

      const byStatus: Record<string, number> = {};
      for (const row of statusCounts) {
        byStatus[row.status] = row._count.status;
      }
      const totalSubmissions = Object.values(byStatus).reduce((a, b) => a + b, 0);
      const approved = byStatus['APPROVED'] ?? 0;
      const pending = byStatus['SUBMITTED'] ?? 0;
      const rejected = byStatus['REJECTED'] ?? 0;
      const draft = byStatus['DRAFT'] ?? 0;
      const approvalRate =
        totalSubmissions > 0
          ? ((approved / totalSubmissions) * 100).toFixed(1)
          : '0';

      const recentList = recentSubmissions
        .map(
          (s) =>
            `- ${s.submitter?.name ?? 'Desconocido'} envió "${s.template?.name ?? '?'}" (${s.status}) el ${s.submitted_at.toLocaleDateString('es-CO')}`,
        )
        .join('\n');

      const templateList = activeTemplates
        .map(
          (t) =>
            `- "${t.name}" (categoría: ${t.category?.name ?? 'Sin categoría'})`,
        )
        .join('\n');

      const systemPrompt = `Eres SEÑALIA, el asistente inteligente de SEÑAL para administradores. Tienes acceso a los datos reales de la organización y respondes en español de forma concisa y útil. Usa markdown para formatear tu respuesta cuando ayude a la comprensión.

DATOS ACTUALES DE LA ORGANIZACIÓN:

Usuarios:
- Total registrados: ${totalUsers}
- Usuarios activos: ${activeUsers}
- Usuarios inactivos: ${totalUsers - activeUsers}

Envíos de formularios:
- Total: ${totalSubmissions}
- Aprobados: ${approved}
- Pendientes de revisión: ${pending}
- Rechazados: ${rejected}
- En borrador: ${draft}
- Tasa de aprobación: ${approvalRate}%

Formularios activos (${activeTemplates.length}):
${templateList || '- No hay formularios activos aún'}

Últimos 5 envíos:
${recentList || '- No hay envíos recientes'}

Responde únicamente con base en estos datos. Si el administrador pregunta algo que no puedes responder con esta información, dilo claramente.`;

      const allMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [
        ...history,
        { role: 'user', content: message },
      ];

      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages: allMessages,
      });

      return { response: (response.content[0] as { text: string }).text };
    } catch (err) {
      this.logger.error(`Error en adminChat: ${(err as Error).message}`);
      return {
        response:
          'Lo siento, ocurrió un error al procesar tu pregunta. Por favor intenta de nuevo.',
      };
    }
  }

  // ─── Helpers de extracción de texto ───────────────────────────────────────

  private async extractText(file: Express.Multer.File): Promise<string> {
    const mime = file.mimetype;

    if (mime === 'application/pdf') {
      const data = await pdfParse(file.buffer);
      return data.text;
    }

    if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      return result.value;
    }

    if (
      mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mime === 'application/vnd.ms-excel'
    ) {
      const workbook = XLSX.read(file.buffer);
      let text = '';
      workbook.SheetNames.forEach((name) => {
        text += XLSX.utils.sheet_to_csv(workbook.Sheets[name]) + '\n';
      });
      return text;
    }

    throw new Error(`Tipo de archivo no soportado: ${mime}`);
  }
}
