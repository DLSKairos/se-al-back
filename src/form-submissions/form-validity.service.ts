import { Injectable, NotFoundException } from '@nestjs/common';
import {
  FormField,
  FormSubmission,
  FormTemplate,
  Frequency,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { computePeriodKey } from '../common/utils/period-key.util';

export interface FieldWithState extends FormField {
  preloadedValue: unknown;
  isReadOnly: boolean;
  effectiveFrequency: Frequency;
}

export interface SubmissionContext {
  template: FormTemplate & { fields: FormField[] };
  existingSubmission: FormSubmission | null;
  fields: FieldWithState[];
  requiresSignature: boolean;
  currentPeriodKey: string | null;
}

@Injectable()
export class FormValidityService {
  constructor(private readonly prisma: PrismaService) {}

  async getSubmissionContext(
    templateId: string,
    orgId: string,
    userId: string,
  ): Promise<SubmissionContext> {
    // 1. Cargar template con fields ordenados
    const template = await this.prisma.formTemplate.findFirst({
      where: { id: templateId, org_id: orgId },
      include: { fields: { orderBy: { order: 'asc' } } },
    });

    if (!template) {
      throw new NotFoundException('Plantilla de formulario no encontrada');
    }

    // 2. Calcular período actual
    const currentPeriodKey = computePeriodKey(
      template.data_frequency as Parameters<typeof computePeriodKey>[0],
    );

    // 3. Buscar submission existente en el período actual
    let existingSubmission: FormSubmission | null = null;
    let submissionValues: Map<string, unknown> = new Map();

    if (currentPeriodKey) {
      existingSubmission = await this.prisma.formSubmission.findFirst({
        where: {
          template_id: templateId,
          org_id: orgId,
          period_key: currentPeriodKey,
          submitted_by: userId,
        },
        orderBy: { submitted_at: 'desc' },
      });
    }

    // 4. Si existe submission, cargar sus values
    if (existingSubmission) {
      const values = await this.prisma.formSubmissionValue.findMany({
        where: { submission_id: existingSubmission.id },
      });

      for (const val of values) {
        const resolved =
          val.value_text ??
          val.value_number ??
          val.value_date ??
          val.value_json ??
          val.value_file ??
          null;
        submissionValues.set(val.field_id, resolved);
      }
    }

    // 5. Calcular estado de cada campo
    const fields: FieldWithState[] = template.fields.map((field) => {
      const effectiveFrequency: Frequency =
        field.revalidation_frequency === Frequency.INHERIT
          ? template.data_frequency
          : field.revalidation_frequency;

      // Sin vigencia temporal → siempre editable
      const noValidity =
        effectiveFrequency === Frequency.ONCE ||
        effectiveFrequency === Frequency.PER_EVENT ||
        effectiveFrequency === Frequency.NONE ||
        effectiveFrequency === Frequency.INHERIT;

      if (noValidity) {
        return {
          ...field,
          effectiveFrequency,
          preloadedValue: submissionValues.get(field.id) ?? null,
          isReadOnly: false,
        };
      }

      // Con vigencia: si hay valor en el período actual → readonly
      const hasValue = submissionValues.has(field.id);

      return {
        ...field,
        effectiveFrequency,
        preloadedValue: hasValue ? submissionValues.get(field.id) : null,
        isReadOnly: hasValue,
      };
    });

    // 6. Calcular requiresSignature
    const requiresSignature = await this.resolveRequiresSignature(
      template,
      orgId,
      userId,
    );

    return {
      template,
      existingSubmission,
      fields,
      requiresSignature,
      currentPeriodKey,
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async resolveRequiresSignature(
    template: FormTemplate,
    orgId: string,
    userId: string,
  ): Promise<boolean> {
    if (
      template.signature_frequency === Frequency.NONE ||
      template.signature_frequency === Frequency.INHERIT
    ) {
      return false;
    }

    const signaturePeriodKey = computePeriodKey(
      template.signature_frequency as Parameters<typeof computePeriodKey>[0],
    );

    if (!signaturePeriodKey) {
      // ONCE / PER_EVENT — siempre requiere firma si no hay ninguna
      const existingSignature = await this.prisma.formSignature.findFirst({
        where: {
          submission: {
            template_id: template.id,
            org_id: orgId,
            submitted_by: userId,
          },
        },
      });
      return existingSignature === null;
    }

    // Buscar si ya hay firma en el período actual
    const signatureInPeriod = await this.prisma.formSignature.findFirst({
      where: {
        submission: {
          template_id: template.id,
          org_id: orgId,
          submitted_by: userId,
          period_key: signaturePeriodKey,
        },
      },
    });

    return signatureInPeriod === null;
  }
}
