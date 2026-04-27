import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SubmissionStatus } from '@prisma/client';
import { FormSubmissionsService } from './form-submissions.service';

// ─── Mocks manuales ──────────────────────────────────────────────────────────

const mockFindFirst = jest.fn();
const mockUpdate = jest.fn();

const prisma = {
  formSubmission: {
    findFirst: mockFindFirst,
    update: mockUpdate,
  },
} as any;

const formValidity = {
  getSubmissionContext: jest.fn(),
} as any;

const formNotifications = {
  dispatchOnSubmit: jest.fn().mockResolvedValue(undefined),
} as any;

describe('FormSubmissionsService — changeStatus', () => {
  let service: FormSubmissionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FormSubmissionsService(prisma, formValidity, formNotifications);
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

  describe('OPERATOR permissions', () => {
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

      expect(result.status).toBe(SubmissionStatus.SUBMITTED);
    });

    it('should throw ForbiddenException when OPERATOR tries to APPROVED', async () => {
      mockFindFirst.mockResolvedValue(baseSubmission);

      await expect(
        service.changeStatus(
          'sub-1',
          'org-1',
          SubmissionStatus.APPROVED,
          'user-1',
          'OPERATOR',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when OPERATOR tries to REJECTED', async () => {
      mockFindFirst.mockResolvedValue(baseSubmission);

      await expect(
        service.changeStatus(
          'sub-1',
          'org-1',
          SubmissionStatus.REJECTED,
          'user-1',
          'OPERATOR',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('ADMIN permissions', () => {
    it('should allow ADMIN to change status to APPROVED', async () => {
      mockFindFirst.mockResolvedValue(baseSubmission);
      mockUpdate.mockResolvedValue({
        ...baseSubmission,
        status: SubmissionStatus.APPROVED,
      });

      const result = await service.changeStatus(
        'sub-1',
        'org-1',
        SubmissionStatus.APPROVED,
        'admin-1',
        'ADMIN',
      );

      expect(result.status).toBe(SubmissionStatus.APPROVED);
    });

    it('should allow ADMIN to change status to REJECTED', async () => {
      mockFindFirst.mockResolvedValue(baseSubmission);
      mockUpdate.mockResolvedValue({
        ...baseSubmission,
        status: SubmissionStatus.REJECTED,
      });

      const result = await service.changeStatus(
        'sub-1',
        'org-1',
        SubmissionStatus.REJECTED,
        'admin-1',
        'ADMIN',
      );

      expect(result.status).toBe(SubmissionStatus.REJECTED);
    });

    it('should allow SUPER_ADMIN to change status to APPROVED', async () => {
      mockFindFirst.mockResolvedValue(baseSubmission);
      mockUpdate.mockResolvedValue({
        ...baseSubmission,
        status: SubmissionStatus.APPROVED,
      });

      await expect(
        service.changeStatus(
          'sub-1',
          'org-1',
          SubmissionStatus.APPROVED,
          'superadmin-1',
          'SUPER_ADMIN',
        ),
      ).resolves.not.toThrow();
    });
  });

  describe('not found scenarios', () => {
    it('should throw NotFoundException when submission does not exist', async () => {
      mockFindFirst.mockResolvedValue(null);

      await expect(
        service.changeStatus(
          'nonexistent-id',
          'org-1',
          SubmissionStatus.APPROVED,
          'admin-1',
          'ADMIN',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when submission belongs to another org', async () => {
      // findFirst filtra por org_id — devuelve null si no coincide
      mockFindFirst.mockResolvedValue(null);

      await expect(
        service.changeStatus(
          'sub-1',
          'org-otro',
          SubmissionStatus.APPROVED,
          'admin-1',
          'ADMIN',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
