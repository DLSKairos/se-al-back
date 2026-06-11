import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, SubmissionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * FormApprovalService — lógica centralizada de aprobación/rechazo de submissions.
 *
 * Reglas:
 * - La APROBACIÓN es solo automática (nunca manual).
 * - El admin solo puede RECHAZAR, con motivo mínimo de 10 chars.
 * - checkAutoApproval puede ser invocado desde:
 *     1. FormSubmissionsService.create() (al enviar)
 *     2. ElectronicSignatureService (tras cada firma exitosa)
 *
 * Firmas requeridas: se consideran las SignatureToken (externos) y SignatureRecord
 * de tipo INTERNAL asociadas al submission. Si no existen firmantes configurados,
 * la condición de firmas se considera cumplida.
 */
@Injectable()
export class FormApprovalService {
  private readonly logger = new Logger(FormApprovalService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notifications: NotificationsService,
  ) {}

  // ─── Auto-aprobación ──────────────────────────────────────────────────────

  /**
   * Evalúa si un submission cumple las condiciones para ser auto-aprobado.
   * Solo actúa sobre submissions en estado SUBMITTED o PENDING_SIGNATURES.
   * Estados terminales (APPROVED, REJECTED, DRAFT) son ignorados.
   */
  async checkAutoApproval(submissionId: string): Promise<void> {
    const submission = await this.prisma.formSubmission.findUnique({
      where: { id: submissionId },
      include: {
        values: true,
        template: {
          include: {
            fields: { where: { required: true } },
            signature_config: true,
          },
        },
        signature_tokens: true,
        signature_records: true,
      },
    });

    if (!submission) {
      this.logger.warn(`checkAutoApproval: submission ${submissionId} no encontrado`);
      return;
    }

    // Solo procesar estados válidos para transición
    const processableStates: SubmissionStatus[] = [
      SubmissionStatus.SUBMITTED,
      SubmissionStatus.PENDING_SIGNATURES,
    ];

    if (!processableStates.includes(submission.status)) {
      return;
    }

    // ── 1. Verificar campos obligatorios ──────────────────────────────────
    const requiredFieldIds = new Set(
      submission.template.fields.map((f) => f.id),
    );

    const filledValuesByField = new Map(
      submission.values.map((v) => [v.field_id, v]),
    );

    let allRequiredFilled = true;
    for (const fieldId of requiredFieldIds) {
      const val = filledValuesByField.get(fieldId);
      if (!val || this.isValueEmpty(val)) {
        allRequiredFilled = false;
        break;
      }
    }

    // ── 2. Verificar estado de firmas ─────────────────────────────────────
    const signatureFrequency = submission.template.signature_frequency;
    const hasSignatureRequirement = signatureFrequency !== 'NONE';

    let signaturesComplete = true;

    if (hasSignatureRequirement) {
      // Verificar tokens externos pendientes
      const pendingExternalTokens = submission.signature_tokens.filter(
        (t) => t.link_status !== 'SIGNED',
      );

      // Verificar si se requiere firma interna y si existe
      const requiresInternal =
        submission.template.signature_config?.requires_internal_sign ?? false;
      const hasInternalRecord = submission.signature_records.some(
        (r) => r.signer_type === 'INTERNAL',
      );

      if (pendingExternalTokens.length > 0) {
        signaturesComplete = false;
      } else if (requiresInternal && !hasInternalRecord) {
        signaturesComplete = false;
      }
    }

    // ── 3. Evaluar transición de estado ───────────────────────────────────
    if (allRequiredFilled && signaturesComplete) {
      // Aprobar automáticamente
      await this.prisma.formSubmission.update({
        where: { id: submissionId },
        data: {
          status: SubmissionStatus.APPROVED,
          auto_approved_at: new Date(),
        },
      });

      this.logger.log(
        `Submission ${submissionId} auto-aprobado (org ${submission.org_id})`,
      );

      // Notificar al operario
      await this.notifyAutoApproval(submission).catch((err) => {
        this.logger.error(
          `Error notificando aprobación de ${submissionId}: ${err.message}`,
        );
      });
    } else if (hasSignatureRequirement && !signaturesComplete) {
      // Hay firmas pendientes → PENDING_SIGNATURES
      if (submission.status !== SubmissionStatus.PENDING_SIGNATURES) {
        await this.prisma.formSubmission.update({
          where: { id: submissionId },
          data: { status: SubmissionStatus.PENDING_SIGNATURES },
        });

        this.logger.log(
          `Submission ${submissionId} → PENDING_SIGNATURES`,
        );
      }
    }
    // Si faltan campos pero no hay firmas pendientes → permanece SUBMITTED (sin cambio)
  }

  // ─── Rechazo manual ───────────────────────────────────────────────────────

  /**
   * Rechaza un submission. Solo ADMIN o SUPER_ADMIN.
   * Solo aplicable a estados SUBMITTED o PENDING_SIGNATURES.
   */
  async reject(
    submissionId: string,
    adminId: string,
    adminOrgId: string,
    reason: string,
  ): Promise<void> {
    if (!reason || reason.trim().length < 10) {
      throw new BadRequestException(
        'El motivo de rechazo debe tener al menos 10 caracteres',
      );
    }

    const submission = await this.prisma.formSubmission.findFirst({
      where: { id: submissionId, org_id: adminOrgId },
      select: {
        id: true,
        status: true,
        submitted_by: true,
        org_id: true,
        template: { select: { name: true } },
      },
    });

    if (!submission) {
      throw new NotFoundException('Envío no encontrado');
    }

    const rejectableStates: SubmissionStatus[] = [
      SubmissionStatus.SUBMITTED,
      SubmissionStatus.PENDING_SIGNATURES,
    ];

    if (!rejectableStates.includes(submission.status)) {
      throw new ForbiddenException(
        `No se puede rechazar un envío en estado ${submission.status}. Solo se pueden rechazar envíos en estado SUBMITTED o PENDING_SIGNATURES.`,
      );
    }

    await this.prisma.formSubmission.update({
      where: { id: submissionId },
      data: {
        status: SubmissionStatus.REJECTED,
        rejected_at: new Date(),
        rejected_by_admin_id: adminId,
        rejection_reason: reason.trim(),
      },
    });

    this.logger.log(
      `Submission ${submissionId} rechazado por admin ${adminId} (org ${adminOrgId})`,
    );

    // Notificar al operario
    await this.notifications
      .create({
        user_id: submission.submitted_by,
        type: NotificationType.FORM_REJECTED,
        title: 'Formulario rechazado',
        body: `Tu formulario "${submission.template.name}" fue rechazado. Motivo: ${reason.trim()}`,
        deep_link: `/form/${submission.id}`,
        created_by_admin_id: adminId,
      })
      .catch((err) => {
        this.logger.error(
          `Error notificando rechazo de ${submissionId}: ${err.message}`,
        );
      });
  }

  // ─── Listado para admin ───────────────────────────────────────────────────

  async findForAdmin(
    orgId: string,
    status?: SubmissionStatus,
    page = 1,
    limit = 50,
  ) {
    const where: Record<string, unknown> = { org_id: orgId };
    if (status) where['status'] = status;

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
          signature_tokens: {
            select: { link_status: true },
          },
        },
        orderBy: { submitted_at: 'desc' },
        take: limit,
        skip,
      }),
      this.prisma.formSubmission.count({ where }),
    ]);

    // Enriquecer con resumen de firmas
    const enriched = data.map((s) => {
      const totalTokens = s.signature_tokens.length;
      const signedTokens = s.signature_tokens.filter(
        (t) => t.link_status === 'SIGNED',
      ).length;

      return {
        ...s,
        signature_summary:
          totalTokens > 0
            ? { total: totalTokens, signed: signedTokens }
            : null,
      };
    });

    return { data: enriched, total, page, limit };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private isValueEmpty(val: {
    value_text: string | null;
    value_number: number | null;
    value_date: Date | null;
    value_json: unknown;
    value_file: string | null;
  }): boolean {
    if (val.value_text !== null && val.value_text !== '') return false;
    if (val.value_number !== null) return false;
    if (val.value_date !== null) return false;
    if (
      val.value_json !== null &&
      val.value_json !== undefined &&
      !(Array.isArray(val.value_json) && (val.value_json as unknown[]).length === 0)
    )
      return false;
    if (val.value_file !== null && val.value_file !== '') return false;
    return true;
  }

  private async notifyAutoApproval(submission: {
    id: string;
    submitted_by: string;
    org_id: string;
    template: { name: string };
  }): Promise<void> {
    // Notificar al operario
    await this.notifications.create({
      user_id: submission.submitted_by,
      type: NotificationType.FORM_APPROVED,
      title: 'Formulario aprobado',
      body: `Tu formulario "${submission.template.name}" fue aprobado automáticamente.`,
      deep_link: `/form/${submission.id}`,
    });

    // Notificar a todos los ADMINs activos de la org
    const admins = await this.prisma.user.findMany({
      where: {
        org_id: submission.org_id,
        role: 'ADMIN',
        is_active: true,
      },
      select: { id: true },
    });

    await Promise.allSettled(
      admins.map((admin) =>
        this.notifications.create({
          user_id: admin.id,
          type: NotificationType.FORM_APPROVED,
          title: 'Formulario aprobado',
          body: `El formulario "${submission.template.name}" fue aprobado automáticamente.`,
          deep_link: `/admin/submissions/${submission.id}`,
        }),
      ),
    );
  }
}
