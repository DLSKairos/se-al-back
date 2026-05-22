import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FormTemplateStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ensureUniqueKeys } from '../common/utils/form-keys.util';
import { CreateFormTemplateDto } from './dto/create-form-template.dto';
import { UpdateFormTemplateDto } from './dto/update-form-template.dto';

@Injectable()
export class FormTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Consultas ─────────────────────────────────────────────────────────────

  /**
   * Retorna templates ACTIVOS aplicando filtro por cargo cuando el usuario
   * es OPERATOR.
   *
   * Reglas:
   * - SUPER_ADMIN / ADMIN → ven todos los templates activos.
   * - OPERATOR con target_job_titles vacío → template visible para todos.
   * - OPERATOR con target_job_titles no vacío → solo si su job_title está
   *   en el array (comparación case-insensitive).
   */
  async findActive(orgId: string, userRole: string, userJobTitle: string) {
    const templates = await this.prisma.formTemplate.findMany({
      where: { org_id: orgId, status: FormTemplateStatus.ACTIVE },
      include: {
        category: true,
        fields: { orderBy: { order: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });

    if (userRole === 'OPERATOR') {
      const normalizedJobTitle = userJobTitle.toLowerCase().trim();
      return templates.filter((t) => {
        if (t.target_job_titles.length === 0) return true;
        return t.target_job_titles.some(
          (title) => title.toLowerCase().trim() === normalizedJobTitle,
        );
      });
    }

    return templates;
  }

  async findAllAdmin(orgId: string) {
    const templates = await this.prisma.formTemplate.findMany({
      where: { org_id: orgId },
      include: {
        category: true,
        fields: { orderBy: { order: 'asc' } },
        _count: { select: { submissions: true } },
      },
      orderBy: { updated_at: 'desc' },
    });

    return templates;
  }

  async findOne(id: string, orgId: string) {
    const template = await this.prisma.formTemplate.findFirst({
      where: { id, org_id: orgId },
      include: {
        category: true,
        fields: { orderBy: { order: 'asc' } },
        notifications: true,
        creator: {
          select: { id: true, name: true },
        },
      },
    });

    if (!template) {
      throw new NotFoundException('Plantilla de formulario no encontrada');
    }

    return template;
  }

  // ─── Mutaciones ────────────────────────────────────────────────────────────

  async create(
    orgId: string,
    createdBy: string,
    dto: CreateFormTemplateDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.formTemplate.create({
        data: {
          org_id: orgId,
          created_by: createdBy,
          name: dto.name,
          description: dto.description ?? null,
          icon: dto.icon ?? null,
          category_id: dto.category_id,
          data_frequency: dto.data_frequency ?? 'ONCE',
          signature_frequency: dto.signature_frequency ?? 'NONE',
          export_pdf: dto.export_pdf ?? true,
          export_excel: dto.export_excel ?? false,
          target_job_titles: dto.target_job_titles ?? [],
          status: FormTemplateStatus.DRAFT,
          columns: dto.columns ?? 1,
          source_file_url: dto.source_file_url ?? null,
          sections: dto.sections ?? undefined,
        },
      });

      if (dto.fields?.length) {
        const uniqueFields = ensureUniqueKeys(dto.fields);
        await tx.formField.createMany({
          data: uniqueFields.map((f, i) => ({
            template_id: template.id,
            order: i,
            label: f.label,
            key: f.key,
            type: f.type ?? 'TEXT',
            required: f.required ?? true,
            options: f.options ?? null,
            section: f.section ?? null,
            placeholder: f.placeholder ?? null,
            help_text: f.helpText ?? null,
          })),
        });
      }

      if (dto.save_as_blueprint && dto.blueprint_name) {
        await tx.formBlueprint.create({
          data: {
            name: dto.blueprint_name,
            category: dto.category_name ?? 'General',
            org_id: orgId,
            is_global: false,
            fields: dto.fields ?? [],
          },
        });
      }

      return tx.formTemplate.findUnique({
        where: { id: template.id },
        include: {
          fields: { orderBy: { order: 'asc' } },
          category: true,
          notifications: true,
        },
      });
    });
  }

  async update(id: string, orgId: string, dto: UpdateFormTemplateDto) {
    await this.assertExists(id, orgId);

    return this.prisma.$transaction(async (tx) => {
      const template = await tx.formTemplate.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.icon !== undefined && { icon: dto.icon }),
          ...(dto.category_id !== undefined && { category_id: dto.category_id }),
          ...(dto.data_frequency !== undefined && {
            data_frequency: dto.data_frequency,
          }),
          ...(dto.signature_frequency !== undefined && {
            signature_frequency: dto.signature_frequency,
          }),
          ...(dto.export_pdf !== undefined && { export_pdf: dto.export_pdf }),
          ...(dto.export_excel !== undefined && {
            export_excel: dto.export_excel,
          }),
          ...(dto.target_job_titles !== undefined && {
            target_job_titles: dto.target_job_titles,
          }),
          ...(dto.columns !== undefined && { columns: dto.columns }),
          ...(dto.source_file_url !== undefined && {
            source_file_url: dto.source_file_url,
          }),
          ...(dto.sections !== undefined && { sections: dto.sections }),
          // El status NO se puede cambiar aquí — usar changeStatus()
        },
      });

      if (dto.fields !== undefined) {
        const uniqueFields = ensureUniqueKeys(dto.fields);

        // IDs que vienen del frontend (solo los que tienen ID válido)
        const incomingIds = uniqueFields
          .map((f) => f.id as string | undefined)
          .filter((fid): fid is string => !!fid);

        // Campos que ya existen en BD para este template
        const existingFields = await tx.formField.findMany({
          where: { template_id: id },
          select: { id: true },
        });
        const existingIds = existingFields.map((f) => f.id);

        // IDs a eliminar = los que ya existían y no vienen en el payload
        const toDeleteIds = existingIds.filter((eid) => !incomingIds.includes(eid));

        if (toDeleteIds.length > 0) {
          // Solo borrar los que no tienen valores en submissions (FK sin cascade)
          const referencedIds = (
            await tx.formSubmissionValue.findMany({
              where: { field_id: { in: toDeleteIds } },
              select: { field_id: true },
              distinct: ['field_id'],
            })
          ).map((v) => v.field_id);

          const safeToDelete = toDeleteIds.filter((did) => !referencedIds.includes(did));
          if (safeToDelete.length > 0) {
            await tx.formField.deleteMany({ where: { id: { in: safeToDelete } } });
          }
        }

        // Upsert cada campo preservando su ID (evita romper FK de submissions)
        for (const [i, f] of uniqueFields.entries()) {
          const fieldData = {
            order: i,
            label: f.label,
            key: f.key,
            type: f.type ?? 'TEXT',
            required: f.required ?? true,
            options: f.options ?? null,
            section: f.section ?? null,
            placeholder: f.placeholder ?? null,
            help_text: f.helpText ?? null,
          };

          if (f.id && incomingIds.includes(f.id)) {
            await tx.formField.upsert({
              where: { id: f.id },
              update: fieldData,
              create: { id: f.id, template_id: template.id, ...fieldData },
            });
          } else {
            await tx.formField.create({
              data: { template_id: template.id, ...fieldData },
            });
          }
        }
      }

      return tx.formTemplate.findUnique({
        where: { id: template.id },
        include: { category: true, fields: { orderBy: { order: 'asc' } } },
      });
    });
  }

  async changeStatus(
    id: string,
    orgId: string,
    newStatus: FormTemplateStatus,
  ) {
    const template = await this.assertExists(id, orgId);
    const current = template.status;

    // Validar transiciones permitidas
    const isAllowed =
      (current === FormTemplateStatus.DRAFT &&
        newStatus === FormTemplateStatus.ACTIVE) ||
      (current === FormTemplateStatus.ACTIVE &&
        newStatus === FormTemplateStatus.ARCHIVED) ||
      (current === FormTemplateStatus.ARCHIVED &&
        newStatus === FormTemplateStatus.ACTIVE);

    if (!isAllowed) {
      throw new BadRequestException(
        `Transición de estado no permitida: ${current} → ${newStatus}`,
      );
    }

    // ACTIVE → ARCHIVED: verificar que no haya submissions en estado DRAFT
    if (
      current === FormTemplateStatus.ACTIVE &&
      newStatus === FormTemplateStatus.ARCHIVED
    ) {
      const openSubmissions = await this.prisma.formSubmission.count({
        where: { template_id: id, org_id: orgId, status: 'DRAFT' },
      });

      if (openSubmissions > 0) {
        throw new BadRequestException(
          `No se puede archivar el formulario: tiene ${openSubmissions} envíos en borrador pendientes`,
        );
      }
    }

    return this.prisma.formTemplate.update({
      where: { id },
      data: { status: newStatus },
    });
  }

  async remove(id: string, orgId: string): Promise<void> {
    const template = await this.assertExists(id, orgId);

    if (template.status !== FormTemplateStatus.DRAFT) {
      throw new BadRequestException(
        'Solo se pueden eliminar formularios en estado borrador. Archiva el formulario si ya fue publicado.',
      );
    }

    await this.prisma.formTemplate.delete({ where: { id } });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async assertExists(id: string, orgId: string) {
    const template = await this.prisma.formTemplate.findFirst({
      where: { id, org_id: orgId },
    });

    if (!template) {
      throw new NotFoundException('Plantilla de formulario no encontrada');
    }

    return template;
  }
}
