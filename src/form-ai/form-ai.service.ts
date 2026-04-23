import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { FileStorageService } from './file-storage.service';
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
  private readonly anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  constructor(private readonly fileStorage: FileStorageService) {}

  // ─── Extracción desde archivo ──────────────────────────────────────────────

  async extractFromFile(file: Express.Multer.File) {
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
      console.log(`[FormAI] Texto extraído: ${text.length} chars`);

      const userPrompt = EXTRACT_USER_PROMPT.replace('{TEXTO_DEL_DOCUMENTO}', text.slice(0, 15000));

      console.log('[FormAI] Llamando a Claude...');
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
      console.error('[FormAI] Error en extractFromFile:', err);
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
