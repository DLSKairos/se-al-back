import { NotFoundException } from '@nestjs/common';
import { Frequency, FormTemplateStatus } from '@prisma/client';
import { FormValidityService } from './form-validity.service';

// ─── Mocks manuales ──────────────────────────────────────────────────────────

const mockTemplateFindFirst = jest.fn();
const mockSubmissionFindFirst = jest.fn();
const mockSubmissionValueFindMany = jest.fn();
const mockSignatureFindFirst = jest.fn();

const prisma = {
  formTemplate: { findFirst: mockTemplateFindFirst },
  formSubmission: { findFirst: mockSubmissionFindFirst },
  formSubmissionValue: { findMany: mockSubmissionValueFindMany },
  formSignature: { findFirst: mockSignatureFindFirst },
} as any;

describe('FormValidityService — getSubmissionContext', () => {
  let service: FormValidityService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FormValidityService(prisma);
  });

  const baseTemplate = {
    id: 'tmpl-1',
    org_id: 'org-1',
    category_id: 'cat-1',
    name: 'Test Form',
    status: FormTemplateStatus.ACTIVE,
    signature_frequency: Frequency.NONE,
    export_pdf: false,
    columns: 1,
    icon: null,
    created_by: 'user-1',
    created_at: new Date(),
    updated_at: new Date(),
    fields: [],
  };

  it('should throw NotFoundException when template is not found', async () => {
    mockTemplateFindFirst.mockResolvedValue(null);

    await expect(
      service.getSubmissionContext('bad-id', 'org-1', 'user-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('should return null existingSubmission for PER_EVENT frequency (no period key)', async () => {
    const template = {
      ...baseTemplate,
      data_frequency: Frequency.PER_EVENT,
      fields: [],
    };

    mockTemplateFindFirst.mockResolvedValue(template);
    mockSignatureFindFirst.mockResolvedValue(null);

    const ctx = await service.getSubmissionContext('tmpl-1', 'org-1', 'user-1');

    expect(ctx.existingSubmission).toBeNull();
    expect(ctx.currentPeriodKey).toBeNull();
  });

  it('should set fields as editable (isReadOnly=false) for PER_EVENT', async () => {
    const field = {
      id: 'field-1',
      template_id: 'tmpl-1',
      order: 1,
      label: 'Campo',
      key: 'campo',
      type: 'TEXT',
      required: true,
      revalidation_frequency: Frequency.INHERIT,
      options: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const template = {
      ...baseTemplate,
      data_frequency: Frequency.PER_EVENT,
      fields: [field],
    };

    mockTemplateFindFirst.mockResolvedValue(template);
    mockSignatureFindFirst.mockResolvedValue(null);

    const ctx = await service.getSubmissionContext('tmpl-1', 'org-1', 'user-1');

    expect(ctx.fields[0].isReadOnly).toBe(false);
  });

  it('should mark field as readOnly when DAILY submission already exists in current period', async () => {
    const field = {
      id: 'field-1',
      template_id: 'tmpl-1',
      order: 1,
      label: 'Campo',
      key: 'campo',
      type: 'TEXT',
      required: true,
      revalidation_frequency: Frequency.INHERIT,
      options: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const template = {
      ...baseTemplate,
      data_frequency: Frequency.DAILY,
      fields: [field],
    };

    const existingSubmission = {
      id: 'sub-existing',
      template_id: 'tmpl-1',
      org_id: 'org-1',
      submitted_by: 'user-1',
      status: 'SUBMITTED',
      period_key: '2025-05-20',
      data: {},
      work_location_id: null,
      geo_lat: null,
      geo_lng: null,
      submitted_at: new Date(),
    };

    const submissionValue = {
      id: 'val-1',
      submission_id: 'sub-existing',
      field_id: 'field-1',
      value_text: 'some value',
      value_number: null,
      value_date: null,
      value_json: null,
      value_file: null,
    };

    mockTemplateFindFirst.mockResolvedValue(template);
    mockSubmissionFindFirst.mockResolvedValue(existingSubmission);
    mockSubmissionValueFindMany.mockResolvedValue([submissionValue]);
    mockSignatureFindFirst.mockResolvedValue(null);

    const ctx = await service.getSubmissionContext('tmpl-1', 'org-1', 'user-1');

    expect(ctx.existingSubmission).not.toBeNull();
    expect(ctx.fields[0].isReadOnly).toBe(true);
    expect(ctx.fields[0].preloadedValue).toBe('some value');
  });

  it('should return isReadOnly=false for WEEKLY when no existing submission in period', async () => {
    const field = {
      id: 'field-1',
      template_id: 'tmpl-1',
      order: 1,
      label: 'Campo',
      key: 'campo',
      type: 'TEXT',
      required: true,
      revalidation_frequency: Frequency.INHERIT,
      options: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const template = {
      ...baseTemplate,
      data_frequency: Frequency.WEEKLY,
      fields: [field],
    };

    mockTemplateFindFirst.mockResolvedValue(template);
    mockSubmissionFindFirst.mockResolvedValue(null);
    mockSignatureFindFirst.mockResolvedValue(null);

    const ctx = await service.getSubmissionContext('tmpl-1', 'org-1', 'user-1');

    expect(ctx.existingSubmission).toBeNull();
    expect(ctx.fields[0].isReadOnly).toBe(false);
  });

  it('should return correct currentPeriodKey for MONTHLY', async () => {
    const template = {
      ...baseTemplate,
      data_frequency: Frequency.MONTHLY,
      fields: [],
    };

    mockTemplateFindFirst.mockResolvedValue(template);
    mockSubmissionFindFirst.mockResolvedValue(null);
    mockSignatureFindFirst.mockResolvedValue(null);

    const ctx = await service.getSubmissionContext('tmpl-1', 'org-1', 'user-1');

    expect(ctx.currentPeriodKey).toMatch(/^\d{4}-\d{2}$/);
  });
});
