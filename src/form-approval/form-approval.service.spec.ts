import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, SubmissionStatus } from '@prisma/client';
import { FormApprovalService } from './form-approval.service';

// ═══════════════════════════════════════════════════════════════════════════════
// MOCKS MANUALES
// ═══════════════════════════════════════════════════════════════════════════════

const mockSubmissionFindUnique = jest.fn();
const mockSubmissionFindFirst = jest.fn();
const mockSubmissionUpdate = jest.fn();
const mockUserFindMany = jest.fn();
const mockTransactionFn = jest.fn();

const prisma = {
  formSubmission: {
    findUnique: mockSubmissionFindUnique,
    findFirst: mockSubmissionFindFirst,
    update: mockSubmissionUpdate,
  },
  user: {
    findMany: mockUserFindMany,
  },
  $transaction: mockTransactionFn,
} as any;

const notifications = {
  create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
} as any;

// ═══════════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════════

const NOW = new Date('2026-06-10T12:00:00.000Z');

/** Valor de submission llenado (no vacío) */
function filledValue(fieldId: string) {
  return {
    field_id: fieldId,
    value_text: 'Sí',
    value_number: null,
    value_date: null,
    value_json: null,
    value_file: null,
  };
}

/** Submission base totalmente lleno y sin requerimientos de firma */
type SubmissionFixture = {
  id: string;
  org_id: string;
  submitted_by: string;
  status: SubmissionStatus;
  auto_approved_at: Date | null;
  template: {
    id: string;
    name: string;
    fields: Array<{ id: string; required: boolean }>;
    signature_config: { requires_internal_sign: boolean } | null;
    signature_frequency: string;
  };
  values: Array<{
    field_id: string;
    value_text: string | null;
    value_number: number | null;
    value_date: Date | null;
    value_json: unknown;
    value_file: string | null;
  }>;
  signature_tokens: Array<{ link_status: string }>;
  signature_records: Array<{ signer_type: string }>;
};

function buildSubmission(overrides: Partial<SubmissionFixture> = {}): SubmissionFixture {
  return {
    id: 'sub-001',
    org_id: 'org-001',
    submitted_by: 'user-op-1',
    status: SubmissionStatus.SUBMITTED,
    auto_approved_at: null,
    template: {
      id: 'tmpl-001',
      name: 'Permiso en Altura',
      fields: [
        { id: 'field-a', required: true },
        { id: 'field-b', required: true },
      ],
      signature_config: null,
      signature_frequency: 'NONE',
    },
    values: [filledValue('field-a'), filledValue('field-b')],
    signature_tokens: [],
    signature_records: [],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE
// ═══════════════════════════════════════════════════════════════════════════════

describe('FormApprovalService', () => {
  let service: FormApprovalService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FormApprovalService(prisma, notifications);

    // Por defecto: no hay admins en la org
    mockUserFindMany.mockResolvedValue([]);
    mockSubmissionUpdate.mockResolvedValue({});
  });

  // ───────────────────────────────────────────────────────────────────────────
  // checkAutoApproval
  // ───────────────────────────────────────────────────────────────────────────

  describe('checkAutoApproval', () => {
    it('should auto-approve when all required fields are filled and no signature requirement', async () => {
      mockSubmissionFindUnique.mockResolvedValue(buildSubmission());

      await service.checkAutoApproval('sub-001');

      expect(mockSubmissionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sub-001' },
          data: expect.objectContaining({
            status: SubmissionStatus.APPROVED,
            auto_approved_at: expect.any(Date),
          }),
        }),
      );
    });

    it('should notify the operator when auto-approving', async () => {
      mockSubmissionFindUnique.mockResolvedValue(buildSubmission());

      await service.checkAutoApproval('sub-001');

      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-op-1',
          type: NotificationType.FORM_APPROVED,
        }),
      );
    });

    it('should notify all active admins of the org when auto-approving', async () => {
      mockSubmissionFindUnique.mockResolvedValue(buildSubmission());
      mockUserFindMany.mockResolvedValue([
        { id: 'admin-1' },
        { id: 'admin-2' },
      ]);

      await service.checkAutoApproval('sub-001');

      // Al menos 3 llamadas: 1 para el operario + 2 para los admins
      expect(notifications.create.mock.calls.length).toBeGreaterThanOrEqual(3);
      const recipientIds = notifications.create.mock.calls.map(
        (call: Array<{ user_id: string }>) => call[0].user_id,
      );
      expect(recipientIds).toContain('user-op-1');
      expect(recipientIds).toContain('admin-1');
      expect(recipientIds).toContain('admin-2');
    });

    it('should transition to PENDING_SIGNATURES when there are pending external tokens', async () => {
      const submission = buildSubmission({
        template: {
          id: 'tmpl-001',
          name: 'Permiso en Altura',
          fields: [{ id: 'field-a', required: true }],
          signature_config: { requires_internal_sign: false },
          signature_frequency: 'ALWAYS',
        },
        values: [filledValue('field-a')],
        signature_tokens: [
          { link_status: 'SENT' }, // pendiente
        ],
        signature_records: [],
      } as any);

      mockSubmissionFindUnique.mockResolvedValue(submission);

      await service.checkAutoApproval('sub-001');

      expect(mockSubmissionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: SubmissionStatus.PENDING_SIGNATURES,
          }),
        }),
      );
    });

    it('should auto-approve when all external tokens are SIGNED and no internal required', async () => {
      const submission = buildSubmission({
        template: {
          id: 'tmpl-001',
          name: 'Permiso en Altura',
          fields: [{ id: 'field-a', required: true }],
          signature_config: { requires_internal_sign: false },
          signature_frequency: 'ALWAYS',
        },
        values: [filledValue('field-a')],
        signature_tokens: [
          { link_status: 'SIGNED' },
        ],
        signature_records: [],
      } as any);

      mockSubmissionFindUnique.mockResolvedValue(submission);

      await service.checkAutoApproval('sub-001');

      expect(mockSubmissionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: SubmissionStatus.APPROVED }),
        }),
      );
    });

    it('should remain in PENDING_SIGNATURES when internal sign is required but missing', async () => {
      const submission = buildSubmission({
        status: SubmissionStatus.PENDING_SIGNATURES,
        template: {
          id: 'tmpl-001',
          name: 'Permiso en Altura',
          fields: [{ id: 'field-a', required: true }],
          signature_config: { requires_internal_sign: true },
          signature_frequency: 'ALWAYS',
        },
        values: [filledValue('field-a')],
        signature_tokens: [{ link_status: 'SIGNED' }],
        signature_records: [], // no firma interna
      } as any);

      mockSubmissionFindUnique.mockResolvedValue(submission);

      await service.checkAutoApproval('sub-001');

      // No debe pasar a APPROVED
      const approvalCall = mockSubmissionUpdate.mock.calls.find(
        (call: Array<{ data: { status: SubmissionStatus } }>) =>
          call[0]?.data?.status === SubmissionStatus.APPROVED,
      );
      expect(approvalCall).toBeUndefined();
    });

    it('should auto-approve when all external SIGNED and internal record exists', async () => {
      const submission = buildSubmission({
        template: {
          id: 'tmpl-001',
          name: 'Permiso en Altura',
          fields: [{ id: 'field-a', required: true }],
          signature_config: { requires_internal_sign: true },
          signature_frequency: 'ALWAYS',
        },
        values: [filledValue('field-a')],
        signature_tokens: [{ link_status: 'SIGNED' }],
        signature_records: [{ signer_type: 'INTERNAL' }],
      } as any);

      mockSubmissionFindUnique.mockResolvedValue(submission);

      await service.checkAutoApproval('sub-001');

      expect(mockSubmissionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: SubmissionStatus.APPROVED }),
        }),
      );
    });

    it('should do nothing when submission is in APPROVED state', async () => {
      mockSubmissionFindUnique.mockResolvedValue(
        buildSubmission({ status: SubmissionStatus.APPROVED }),
      );

      await service.checkAutoApproval('sub-001');

      expect(mockSubmissionUpdate).not.toHaveBeenCalled();
    });

    it('should do nothing when submission is in REJECTED state', async () => {
      mockSubmissionFindUnique.mockResolvedValue(
        buildSubmission({ status: SubmissionStatus.REJECTED }),
      );

      await service.checkAutoApproval('sub-001');

      expect(mockSubmissionUpdate).not.toHaveBeenCalled();
    });

    it('should do nothing when submission is in DRAFT state', async () => {
      mockSubmissionFindUnique.mockResolvedValue(
        buildSubmission({ status: SubmissionStatus.DRAFT }),
      );

      await service.checkAutoApproval('sub-001');

      expect(mockSubmissionUpdate).not.toHaveBeenCalled();
    });

    it('should do nothing when submission is not found (logs warning, no throw)', async () => {
      mockSubmissionFindUnique.mockResolvedValue(null);

      // No debe lanzar excepción
      await expect(service.checkAutoApproval('nonexistent')).resolves.toBeUndefined();
      expect(mockSubmissionUpdate).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // reject
  // ───────────────────────────────────────────────────────────────────────────

  describe('reject', () => {
    beforeEach(() => {
      mockSubmissionFindFirst.mockResolvedValue(buildSubmission());
    });

    it('should throw BadRequestException when reason is empty', async () => {
      await expect(
        service.reject('sub-001', 'admin-1', 'org-001', ''),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when reason has fewer than 10 characters', async () => {
      await expect(
        service.reject('sub-001', 'admin-1', 'org-001', 'Corto'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow rejection when reason has exactly 10 characters', async () => {
      await service.reject('sub-001', 'admin-1', 'org-001', '1234567890');

      expect(mockSubmissionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: SubmissionStatus.REJECTED }),
        }),
      );
    });

    it('should throw NotFoundException when submission does not belong to the org', async () => {
      mockSubmissionFindFirst.mockResolvedValue(null);

      await expect(
        service.reject('sub-001', 'admin-1', 'wrong-org', 'Motivo de rechazo válido'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when submission is already APPROVED', async () => {
      mockSubmissionFindFirst.mockResolvedValue(
        buildSubmission({ status: SubmissionStatus.APPROVED }),
      );

      await expect(
        service.reject('sub-001', 'admin-1', 'org-001', 'Motivo de rechazo válido'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when submission is in DRAFT state', async () => {
      mockSubmissionFindFirst.mockResolvedValue(
        buildSubmission({ status: SubmissionStatus.DRAFT }),
      );

      await expect(
        service.reject('sub-001', 'admin-1', 'org-001', 'Motivo de rechazo válido'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should record rejected_by_admin_id and rejection_reason on successful reject', async () => {
      const reason = 'Equipos defectuosos detectados en revisión';

      await service.reject('sub-001', 'admin-1', 'org-001', reason);

      expect(mockSubmissionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sub-001' },
          data: expect.objectContaining({
            status: SubmissionStatus.REJECTED,
            rejected_by_admin_id: 'admin-1',
            rejection_reason: reason,
            rejected_at: expect.any(Date),
          }),
        }),
      );
    });

    it('should notify the operator with FORM_REJECTED notification', async () => {
      await service.reject('sub-001', 'admin-1', 'org-001', 'Motivo de rechazo suficientemente largo');

      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-op-1',
          type: NotificationType.FORM_REJECTED,
          created_by_admin_id: 'admin-1',
        }),
      );
    });

    it('should allow rejection of a PENDING_SIGNATURES submission', async () => {
      mockSubmissionFindFirst.mockResolvedValue(
        buildSubmission({ status: SubmissionStatus.PENDING_SIGNATURES }),
      );

      await service.reject('sub-001', 'admin-1', 'org-001', 'Firma ilegible en el documento');

      expect(mockSubmissionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: SubmissionStatus.REJECTED }),
        }),
      );
    });
  });
});
