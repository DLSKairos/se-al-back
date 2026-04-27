import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SubmissionStatus } from '@prisma/client';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { FormSubmissionsService } from '../../../src/form-submissions/form-submissions.service';
import { FormValidityService } from '../../../src/form-submissions/form-validity.service';
import { FormNotificationsService } from '../../../src/form-notifications/form-notifications.service';
import { truncateAll } from '../../helpers/db-cleanup';
import {
  createTestOrg,
  createTestUser,
  createTestFormCategory,
  createTestFormWithFields,
  createTestSubmission,
} from '../../helpers/factories';

// Mock de FormNotificationsService para no depender de SMTP/Push
const formNotificationsMock = {
  dispatchOnSubmit: jest.fn().mockResolvedValue(undefined),
};

let testingModule: TestingModule;
let service: FormSubmissionsService;
let prisma: PrismaService;

beforeAll(async () => {
  testingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ envFilePath: '.env.test', isGlobal: true }),
    ],
    providers: [
      FormSubmissionsService,
      FormValidityService,
      PrismaService,
      { provide: FormNotificationsService, useValue: formNotificationsMock },
    ],
  }).compile();

  await testingModule.init();
  service = testingModule.get(FormSubmissionsService);
  prisma = testingModule.get(PrismaService);
});

afterAll(async () => {
  await testingModule.close();
});

beforeEach(async () => {
  await truncateAll(prisma);
  jest.clearAllMocks();
});

describe('FormSubmissionsService — integration', () => {
  describe('create()', () => {
    it('should create a submission with values', async () => {
      const org = await createTestOrg(prisma);
      const user = await createTestUser(prisma, org.id);
      const category = await createTestFormCategory(prisma, org.id);
      const { template, fields } = await createTestFormWithFields(
        prisma,
        org.id,
        category.id,
        user.id,
      );

      const submission = await service.create(org.id, user.id, {
        template_id: template.id,
        data: { [fields[0].key]: 'valor de prueba' },
      });

      expect(submission.template_id).toBe(template.id);
      expect(submission.org_id).toBe(org.id);
      expect(submission.submitted_by).toBe(user.id);
      expect(submission.values).toHaveLength(1);
    });
  });

  describe('findAll()', () => {
    it('should filter by template_id', async () => {
      const org = await createTestOrg(prisma);
      const user = await createTestUser(prisma, org.id);
      const category = await createTestFormCategory(prisma, org.id);

      const { template: tmpl1, fields: fields1 } = await createTestFormWithFields(
        prisma,
        org.id,
        category.id,
        user.id,
      );
      const { template: tmpl2, fields: fields2 } = await createTestFormWithFields(
        prisma,
        org.id,
        category.id,
        user.id,
      );

      await createTestSubmission(prisma, org.id, tmpl1.id, user.id, fields1[0].id);
      await createTestSubmission(prisma, org.id, tmpl2.id, user.id, fields2[0].id);

      const result = await service.findAll(org.id, { template_id: tmpl1.id });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].template_id).toBe(tmpl1.id);
    });

    it('should filter by status', async () => {
      const org = await createTestOrg(prisma);
      const user = await createTestUser(prisma, org.id);
      const category = await createTestFormCategory(prisma, org.id);
      const { template, fields } = await createTestFormWithFields(
        prisma,
        org.id,
        category.id,
        user.id,
      );

      const submission = await createTestSubmission(
        prisma,
        org.id,
        template.id,
        user.id,
        fields[0].id,
      );

      // Aprobar la submission
      await prisma.formSubmission.update({
        where: { id: submission.id },
        data: { status: SubmissionStatus.APPROVED },
      });

      const approved = await service.findAll(org.id, {
        status: SubmissionStatus.APPROVED,
      });
      const submitted = await service.findAll(org.id, {
        status: SubmissionStatus.SUBMITTED,
      });

      expect(approved.data).toHaveLength(1);
      expect(submitted.data).toHaveLength(0);
    });

    it('should NOT return submissions from another org (multi-tenant isolation)', async () => {
      const org1 = await createTestOrg(prisma);
      const org2 = await createTestOrg(prisma);

      const user1 = await createTestUser(prisma, org1.id);
      const user2 = await createTestUser(prisma, org2.id);

      const category1 = await createTestFormCategory(prisma, org1.id);
      const category2 = await createTestFormCategory(prisma, org2.id);

      const { template: tmpl2, fields: fields2 } = await createTestFormWithFields(
        prisma,
        org2.id,
        category2.id,
        user2.id,
      );

      // Solo creo submission en org2
      await createTestSubmission(prisma, org2.id, tmpl2.id, user2.id, fields2[0].id);

      // Consulta desde org1 — debe devolver vacío
      const result = await service.findAll(org1.id, {});

      expect(result.data).toHaveLength(0);
    });
  });

  describe('changeStatus() with real DB', () => {
    it('should persist the new status in the database', async () => {
      const org = await createTestOrg(prisma);
      const user = await createTestUser(prisma, org.id);
      const category = await createTestFormCategory(prisma, org.id);
      const { template, fields } = await createTestFormWithFields(
        prisma,
        org.id,
        category.id,
        user.id,
      );

      const submission = await createTestSubmission(
        prisma,
        org.id,
        template.id,
        user.id,
        fields[0].id,
      );

      await service.changeStatus(
        submission.id,
        org.id,
        SubmissionStatus.APPROVED,
        user.id,
        'ADMIN',
      );

      const updated = await prisma.formSubmission.findUnique({
        where: { id: submission.id },
      });

      expect(updated?.status).toBe(SubmissionStatus.APPROVED);
    });
  });
});
