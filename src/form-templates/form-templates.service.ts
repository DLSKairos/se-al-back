import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FormTemplateStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFormTemplateDto } from './dto/create-form-template.dto';
import { UpdateFormTemplateDto } from './dto/update-form-template.dto';

@Injectable()
export class FormTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Consultas ─────────────────────────────────────────────────────────────

  async findActive(orgId: string) {
    return this.prisma.formTemplate.findMany({
      where: { org_id: orgId, status: FormTemplateStatus.ACTIVE },
      include: {
        category: true,
        fields: { orderBy: { order: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });
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
    return this.prisma.formTemplate.create({
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
        status: FormTemplateStatus.DRAFT,
      },
      include: { category: true },
    });
  }

  async update(id: string, orgId: string, dto: UpdateFormTemplateDto) {
    await this.assertExists(id, orgId);

    return this.prisma.formTemplate.update({
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
        // El status NO se puede cambiar aquí — usar changeStatus()
      },
      include: { category: true, fields: { orderBy: { order: 'asc' } } },
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
    await this.changeStatus(id, orgId, FormTemplateStatus.ARCHIVED);
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
