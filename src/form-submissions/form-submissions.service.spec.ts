import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SubmissionStatus } from '@prisma/client';
import { FormSubmissionsService } from './form-submissions.service';

// ─── Mocks manuales ──────────────────────────────────────────────────────────

const mockFindFirst = jest.fn();
const mockUpdate = jest.fn();
const mockFindUnique = jest.fn();

const prisma = {
  formSubmission: {
    findFirst: mockFindFirst,
    update: mockUpdate,
    findUnique: mockFindUnique,
  },
} as any;

const formValidity = {
  getSubmissionContext: jest.fn(),
} as any;

const formNotifications = {
  dispatchOnSubmit: jest.fn().mockResolvedValue(undefined),
} as any;

const formApproval = {
  checkAutoApproval: jest.fn().mockResolvedValue(undefined),
  reject: jest.fn().mockResolvedValue(undefined),
} as any;

describe('FormSubmissionsService — changeStatus', () => {
  let service: FormSubmissionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FormSubmissionsService(
      prisma,
      formValidity,
      formNotifications,
      formApproval,
    );
  });

  const baseSubmission = {
    id: 'sub-1',
    org_id: 'org-1',
    template_id: 'tmpl-1',
    submitted_by: 'user-1',
    status: SubmissionStatus.SUBMITTED,
    data: {},
    period_key: null,
    work_location_id: null,
    geo_lat: null,
    geo_lng: null,
    submitted_at: new Date(),
  };

  describe('APPROVED — siempre bloqueado (aprobación solo automática)', () => {
    it('should throw ForbiddenException when OPERATOR tries to APPROVE', async () => {
      await expect(
        service.changeStatus('sub-1', 'org-1', SubmissionStatus.APPROVED, 'user-1', 'OPERATOR'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when ADMIN tries to APPROVE manually', async () => {
      await expect(
        service.changeStatus('sub-1', 'org-1', SubmissionStatus.APPROVED, 'admin-1', 'ADMIN'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when SUPER_ADMIN tries to APPROVE manually', async () => {
      await expect(
        service.changeStatus('sub-1', 'org-1', SubmissionStatus.APPROVED, 'superadmin-1', 'SUPER_ADMIN'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('REJECTED — delegado a FormApprovalService.reject', () => {
    it('should throw ForbiddenException when OPERATOR tries to REJECT', async () => {
      await expect(
        service.changeStatus('sub-1', 'org-1', SubmissionStatus.REJECTED, 'user-1', 'OPERATOR'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow ADMIN to REJECT (delegated to FormApprovalService)', async () => {
      mockFindUnique.mockResolvedValue({ ...baseSubmission, status: SubmissionStatus.REJECTED });

      await service.changeStatus(
        'sub-1',
        'org-1',
        SubmissionStatus.REJECTED,
        'admin-1',
        'ADMIN',
        'Motivo con más de 10 chars',
      );

      expect(formApproval.reject).toHaveBeenCalledWith(
        'sub-1',
        'admin-1',
        'org-1',
        'Motivo con más de 10 chars',
      );
    });
  });

  describe('OPERATOR permissions — transiciones de estado no sensitivas', () => {
    it('should allow OPERATOR to change status to SUBMITTED', async () => {
      mockFindFirst.mockResolvedValue(baseSubmission);
      mockUpdate.mockResolvedValue({
        ...baseSubmission,
        status: SubmissionStatus.SUBMITTED,
      });

      const result = await service.changeStatus(
        'sub-1',
        'org-1',
        SubmissionStatus.SUBMITTED,
        'user-1',
        'OPERATOR',
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.status).toBe(SubmissionStatus.SUBMITTED);
      }
    });
  });

  describe('not found scenarios', () => {
    it('should throw NotFoundException when submission does not exist for non-sensitive transition', async () => {
      mockFindFirst.mockResolvedValue(null);

      await expect(
        service.changeStatus(
          'nonexistent-id',
          'org-1',
          SubmissionStatus.SUBMITTED,
          'user-1',
          'OPERATOR',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
