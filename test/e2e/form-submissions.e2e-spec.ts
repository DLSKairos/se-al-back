import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });

import * as request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { ResponseTransformInterceptor } from '../../src/common/interceptors/response-transform.interceptor';
import { PrismaService } from '../../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { truncateAll } from '../helpers/db-cleanup';
import { generateTestToken } from '../helpers/jwt.helper';
import {
  createTestOrg,
  createTestUser,
  createTestFormCategory,
  createTestFormWithFields,
  createTestSubmission,
} from '../helpers/factories';
import { UserRole } from '@prisma/client';

let app: INestApplication;
let prisma: PrismaService;
let jwtService: JwtService;

beforeAll(async () => {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseTransformInterceptor());
  await app.init();

  prisma = app.get(PrismaService);
  jwtService = app.get(JwtService);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await truncateAll(prisma);
});

describe('POST /api/form-submissions', () => {
  it('should return 201 with valid payload', async () => {
    const org = await createTestOrg(prisma);
    const user = await createTestUser(prisma, org.id, { role: UserRole.OPERATOR });
    const category = await createTestFormCategory(prisma, org.id);
    const { template, fields } = await createTestFormWithFields(
      prisma,
      org.id,
      category.id,
      user.id,
    );

    const token = generateTestToken(jwtService, {
      sub: user.id,
      orgId: org.id,
      role: 'OPERATOR',
    });

    const res = await request(app.getHttpServer())
      .post('/api/form-submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        template_id: template.id,
        data: { [fields[0].key]: 'valor de prueba' },
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.template_id).toBe(template.id);
  });

  it('should return 401 without token', async () => {
    await request(app.getHttpServer())
      .post('/api/form-submissions')
      .send({ template_id: 'any', data: {} })
      .expect(401);
  });
});

describe('GET /api/form-submissions', () => {
  it('should return only submissions from the current org', async () => {
    const org1 = await createTestOrg(prisma);
    const org2 = await createTestOrg(prisma);

    const user1 = await createTestUser(prisma, org1.id, { role: UserRole.ADMIN });
    const user2 = await createTestUser(prisma, org2.id);
    const category1 = await createTestFormCategory(prisma, org1.id);
    const category2 = await createTestFormCategory(prisma, org2.id);

    const { template: tmpl2, fields: fields2 } = await createTestFormWithFields(
      prisma,
      org2.id,
      category2.id,
      user2.id,
    );

    // Solo crear submission en org2
    await createTestSubmission(prisma, org2.id, tmpl2.id, user2.id, fields2[0].id);

    const token = generateTestToken(jwtService, {
      sub: user1.id,
      orgId: org1.id,
      role: 'ADMIN',
    });

    const res = await request(app.getHttpServer())
      .get('/api/form-submissions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    // Org1 no tiene submissions — aislamiento multi-tenant
    expect(res.body.data.data).toHaveLength(0);
  });
});

describe('PATCH /api/form-submissions/:id/status', () => {
  it('should return 403 when OPERATOR tries to set APPROVED', async () => {
    const org = await createTestOrg(prisma);
    const operator = await createTestUser(prisma, org.id, { role: UserRole.OPERATOR });
    const category = await createTestFormCategory(prisma, org.id);
    const { template, fields } = await createTestFormWithFields(
      prisma,
      org.id,
      category.id,
      operator.id,
    );

    const submission = await createTestSubmission(
      prisma,
      org.id,
      template.id,
      operator.id,
      fields[0].id,
    );

    const token = generateTestToken(jwtService, {
      sub: operator.id,
      orgId: org.id,
      role: 'OPERATOR',
    });

    // El endpoint está decorado con @Roles('ADMIN') → debe devolver 403
    await request(app.getHttpServer())
      .patch(`/api/form-submissions/${submission.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'APPROVED' })
      .expect(403);
  });

  it('should return 200 when ADMIN changes status to APPROVED', async () => {
    const org = await createTestOrg(prisma);
    const admin = await createTestUser(prisma, org.id, { role: UserRole.ADMIN });
    const operator = await createTestUser(prisma, org.id, { role: UserRole.OPERATOR });
    const category = await createTestFormCategory(prisma, org.id);
    const { template, fields } = await createTestFormWithFields(
      prisma,
      org.id,
      category.id,
      admin.id,
    );

    const submission = await createTestSubmission(
      prisma,
      org.id,
      template.id,
      operator.id,
      fields[0].id,
    );

    const token = generateTestToken(jwtService, {
      sub: admin.id,
      orgId: org.id,
      role: 'ADMIN',
    });

    const res = await request(app.getHttpServer())
      .patch(`/api/form-submissions/${submission.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'APPROVED' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('APPROVED');
  });
});
