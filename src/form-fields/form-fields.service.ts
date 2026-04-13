import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FieldType, Frequency, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toSnakeCase } from '../common/utils/slug.util';
import { CreateFormFieldDto } from './dto/create-form-field.dto';
import { UpdateFormFieldDto } from './dto/update-form-field.dto';
import { ReorderFieldsDto } from './dto/reorder-fields.dto';

@Injectable()
export class FormFieldsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Consultas ─────────────────────────────────────────────────────────────

  async findAll(templateId: string, orgId: string) {
    await this.assertTemplateExists(templateId, orgId);

    return this.prisma.formField.findMany({
      where: { template_id: templateId },
      orderBy: { order: 'asc' },
    });
  }

  // ─── Mutaciones ────────────────────────────────────────────────────────────

  async create(templateId: string, orgId: string, dto: CreateFormFieldDto) {
    await this.assertTemplateExists(templateId, orgId);
    await this.assertNoSubmissions(templateId, orgId);

    // Generar key desde label si no viene
    const rawKey = dto.key ?? toSnakeCase(dto.label);

    // Verificar unicidad de key dentro del template
    const keyConflict = await this.prisma.formField.findUnique({
      where: { template_id_key: { template_id: templateId, key: rawKey } },
    });

    if (keyConflict) {
      throw new BadRequestException(
        `Ya existe un campo con la clave "${rawKey}" en esta plantilla`,
      );
    }

    // Determinar order: max actual + 1
    const maxOrder = await this.prisma.formField.aggregate({
      where: { template_id: templateId },
      _max: { order: true },
    });

    const order = dto.order ?? (maxOrder._max.order ?? 0) + 1;

    return this.prisma.formField.create({
      data: {
        template_id: templateId,
        label: dto.label,
        key: rawKey,
        type: dto.type as FieldType,
        required: dto.required ?? true,
        order,
        default_value: dto.default_value ?? null,
        options: dto.options != null ? (dto.options as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        validations: dto.validations != null ? (dto.validations as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        revalidation_frequency:
          (dto.revalidation_frequency as Frequency) ?? Frequency.INHERIT,
      },
    });
  }

  async update(
    templateId: string,
    fieldId: string,
    orgId: string,
    dto: UpdateFormFieldDto,
  ) {
    await this.assertTemplateExists(templateId, orgId);
    await this.assertNoSubmissions(templateId, orgId);

    const field = await this.prisma.formField.findFirst({
      where: { id: fieldId, template_id: templateId },
    });

    if (!field) {
      throw new NotFoundException('Campo de formulario no encontrado');
    }

    // Si cambia el label y no viene key explícita, regenerar key
    let newKey = dto.key;
    if (dto.label && !dto.key) {
      newKey = toSnakeCase(dto.label);
    }

    // Verificar unicidad si cambia la key
    if (newKey && newKey !== field.key) {
      const conflict = await this.prisma.formField.findUnique({
        where: {
          template_id_key: { template_id: templateId, key: newKey },
        },
      });
      if (conflict) {
        throw new BadRequestException(
          `Ya existe un campo con la clave "${newKey}" en esta plantilla`,
        );
      }
    }

    return this.prisma.formField.update({
      where: { id: fieldId },
      data: {
        ...(dto.label !== undefined && { label: dto.label }),
        ...(newKey !== undefined && { key: newKey }),
        ...(dto.type !== undefined && { type: dto.type as FieldType }),
        ...(dto.required !== undefined && { required: dto.required }),
        ...(dto.order !== undefined && { order: dto.order }),
        ...(dto.default_value !== undefined && {
          default_value: dto.default_value,
        }),
        ...(dto.options !== undefined && { options: dto.options != null ? (dto.options as unknown as Prisma.InputJsonValue) : Prisma.JsonNull }),
        ...(dto.validations !== undefined && { validations: dto.validations != null ? (dto.validations as unknown as Prisma.InputJsonValue) : Prisma.JsonNull }),
        ...(dto.revalidation_frequency !== undefined && {
          revalidation_frequency: dto.revalidation_frequency as Frequency,
        }),
      },
    });
  }

  async remove(
    templateId: string,
    fieldId: string,
    orgId: string,
  ): Promise<void> {
    await this.assertTemplateExists(templateId, orgId);
    await this.assertNoSubmissions(templateId, orgId);

    const field = await this.prisma.formField.findFirst({
      where: { id: fieldId, template_id: templateId },
    });

    if (!field) {
      throw new NotFoundException('Campo de formulario no encontrado');
    }

    await this.prisma.formField.delete({ where: { id: fieldId } });
  }

  async reorder(
    templateId: string,
    orgId: string,
    dto: ReorderFieldsDto,
  ): Promise<void> {
    await this.assertTemplateExists(templateId, orgId);
    const items = dto.items;

    // Verificar que todos los IDs pertenecen al template
    const fields = await this.prisma.formField.findMany({
      where: { template_id: templateId },
      select: { id: true },
    });

    const validIds = new Set(fields.map((f) => f.id));
    for (const item of items) {
      if (!validIds.has(item.id)) {
        throw new BadRequestException(
          `El campo ${item.id} no pertenece a esta plantilla`,
        );
      }
    }

    // Actualizar orders en una sola transacción
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.formField.update({
          where: { id: item.id },
          data: { order: item.order },
        }),
      ),
    );
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async assertTemplateExists(
    templateId: string,
    orgId: string,
  ): Promise<void> {
    const template = await this.prisma.formTemplate.findFirst({
      where: { id: templateId, org_id: orgId },
      select: { id: true },
    });

    if (!template) {
      throw new NotFoundException('Plantilla de formulario no encontrada');
    }
  }

  private async assertNoSubmissions(
    templateId: string,
    orgId: string,
  ): Promise<void> {
    const count = await this.prisma.formSubmission.count({
      where: { template_id: templateId, org_id: orgId },
    });

    if (count > 0) {
      throw new BadRequestException(
        `No se pueden modificar los campos de esta plantilla porque ya tiene ${count} envío(s) registrado(s). ` +
          'Cree una nueva versión del formulario.',
      );
    }
  }
}
