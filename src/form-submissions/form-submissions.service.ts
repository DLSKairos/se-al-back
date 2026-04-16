import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FormTemplate, FormTemplateStatus, Prisma, SubmissionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FormValidityService } from './form-validity.service';
import { FormNotificationsService } from '../form-notifications/form-notifications.service';
import { computePeriodKey } from '../common/utils/period-key.util';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { SubmissionQueryDto } from './dto/submission-query.dto';

@Injectable()
export class FormSubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly formValidity: FormValidityService,
    private readonly formNotifications: FormNotificationsService,
  ) {}

  // ─── Contexto ──────────────────────────────────────────────────────────────

  async getContext(templateId: string, orgId: string, userId: string) {
    return this.formValidity.getSubmissionContext(templateId, orgId, userId);
  }

  // ─── Crear submission ──────────────────────────────────────────────────────

  async create(
    orgId: string,
    submittedBy: string,
    dto: CreateSubmissionDto,
    workLocationId?: string,
    geoLat?: number,
    geoLng?: number,
  ) {
    // Validar template activo y perteneciente a la org
    const template = await this.prisma.formTemplate.findFirst({
      where: {
        id: dto.template_id,
        org_id: orgId,
        status: FormTemplateStatus.ACTIVE,
      },
      include: { fields: { orderBy: { order: 'asc' } } },
    });

    if (!template) {
      throw new NotFoundException(
        'Plantilla de formulario no encontrada o no está activa',
      );
    }

    // Calcular period_key
    const periodKey = computePeriodKey(
      template.data_frequency as Parameters<typeof computePeriodKey>[0],
    );

    // Construir snapshot data = { [field.key]: value }
    const data: Record<string, unknown> = {};
    for (const field of template.fields) {
      data[field.key] = dto.data[field.key] ?? null;
    }

    // Construir los FormSubmissionValue por cada campo
    const valuesToCreate = template.fields.map((field) => {
      const rawValue = dto.data[field.key];
      return this.buildValueRecord(field.id, rawValue);
    });

    // Crear submission + values en una sola transacción
    const submission = await this.prisma.$transaction(async (tx) => {
      const created = await tx.formSubmission.create({
        data: {
          template_id: dto.template_id,
          org_id: orgId,
          submitted_by: submittedBy,
          work_location_id: workLocationId ?? null,
          period_key: periodKey,
          data: data as Prisma.InputJsonValue,
          geo_lat: geoLat ?? null,
          geo_lng: geoLng ?? null,
          status: SubmissionStatus.SUBMITTED,
          values: {
            create: valuesToCreate,
          },
        },
        include: { values: true },
      });

      return created;
    });

    // Disparar notificaciones de forma asíncrona (fire and forget)
    this.formNotifications
      .dispatchOnSubmit(submission, template as FormTemplate)
      .catch(() => {
        // Silenciar errores de notificación — no deben afectar la respuesta
      });

    return submission;
  }

  // ─── Consultas ─────────────────────────────────────────────────────────────

  async findOne(id: string, orgId: string) {
    const submission = await this.prisma.formSubmission.findFirst({
      where: { id, org_id: orgId },
      include: {
        template: {
          include: { fields: { orderBy: { order: 'asc' } } },
        },
        values: {
          include: { field: true },
        },
        signatures: true,
        submitter: {
          select: {
            id: true,
            name: true,
            identification_number: true,
            job_title: true,
          },
        },
        work_location: true,
      },
    });

    if (!submission) {
      throw new NotFoundException('Envío no encontrado');
    }

    return submission;
  }

  async findAll(orgId: string, query: SubmissionQueryDto) {
    const where: Record<string, unknown> = { org_id: orgId };

    if (query.template_id) where['template_id'] = query.template_id;
    if (query.user_id) where['submitted_by'] = query.user_id;
    if (query.status) where['status'] = query.status;
    if (query.search) {
      where['OR'] = [
        { template: { name: { contains: query.search, mode: 'insensitive' } } },
        { submitter: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    if (query.from || query.to) {
      where['submitted_at'] = {
        ...(query.from && { gte: new Date(query.from) }),
        ...(query.to && { lte: new Date(query.to) }),
      };
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.formSubmission.findMany({
        where,
        include: {
          template: { select: { id: true, name: true, icon: true } },
          submitter: {
            select: { id: true, name: true, identification_number: true },
          },
          work_location: { select: { id: true, name: true } },
        },
        orderBy: { submitted_at: 'desc' },
        take: limit,
        skip,
      }),
      this.prisma.formSubmission.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  // ─── Cambio de estado ──────────────────────────────────────────────────────

  async changeStatus(
    id: string,
    orgId: string,
    status: SubmissionStatus,
    userId: string,
    userRole: string,
  ) {
    const submission = await this.prisma.formSubmission.findFirst({
      where: { id, org_id: orgId },
    });

    if (!submission) {
      throw new NotFoundException('Envío no encontrado');
    }

    // Solo ADMIN puede aprobar o rechazar
    if (
      (status === SubmissionStatus.APPROVED ||
        status === SubmissionStatus.REJECTED) &&
      userRole !== 'ADMIN' &&
      userRole !== 'SUPER_ADMIN'
    ) {
      throw new ForbiddenException(
        'Solo los administradores pueden aprobar o rechazar envíos',
      );
    }

    return this.prisma.formSubmission.update({
      where: { id },
      data: { status },
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private buildValueRecord(
    fieldId: string,
    rawValue: unknown,
  ): {
    field: { connect: { id: string } };
    value_text: string | null;
    value_number: number | null;
    value_date: Date | null;
    value_json: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue;
    value_file: string | null;
  } {
    const base = {
      field: { connect: { id: fieldId } },
      value_text: null as string | null,
      value_number: null as number | null,
      value_date: null as Date | null,
      value_json: Prisma.JsonNull as Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue,
      value_file: null as string | null,
    };

    if (rawValue === null || rawValue === undefined) return base;

    if (typeof rawValue === 'number') {
      return { ...base, value_number: rawValue };
    }

    if (typeof rawValue === 'boolean') {
      return { ...base, value_json: rawValue as Prisma.InputJsonValue };
    }

    if (rawValue instanceof Date) {
      return { ...base, value_date: rawValue };
    }

    if (typeof rawValue === 'string') {
      // Intentar parsear como fecha ISO
      const dateAttempt = new Date(rawValue);
      if (
        rawValue.match(/^\d{4}-\d{2}-\d{2}/) &&
        !isNaN(dateAttempt.getTime())
      ) {
        return { ...base, value_date: dateAttempt };
      }
      return { ...base, value_text: rawValue };
    }

    if (typeof rawValue === 'object' || Array.isArray(rawValue)) {
      return { ...base, value_json: rawValue as Prisma.InputJsonValue };
    }

    return { ...base, value_text: String(rawValue) };
  }
}
