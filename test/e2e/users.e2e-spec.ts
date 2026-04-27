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
import { createTestOrg, createTestUser } from '../helpers/factories';
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

describe('GET /api/users', () => {
  it('should return 401 without token', async () => {
    await request(app.getHttpServer()).get('/api/users').expect(401);
  });

  it('should return 403 with OPERATOR token', async () => {
    const org = await createTestOrg(prisma);
    const user = await createTestUser(prisma, org.id, { role: UserRole.OPERATOR });
    const token = generateTestToken(jwtService, {
      sub: user.id,
      orgId: org.id,
      role: 'OPERATOR',
    });

    await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('should return 200 with empty array for ADMIN with no users', async () => {
    const org = await createTestOrg(prisma);
    const admin = await createTestUser(prisma, org.id, { role: UserRole.ADMIN });
    const token = generateTestToken(jwtService, {
      sub: admin.id,
      orgId: org.id,
      role: 'ADMIN',
    });

    const res = await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // El admin existe en la lista (está activo), devuelve al menos el admin mismo
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('should NOT return users from another org', async () => {
    const org1 = await createTestOrg(prisma);
    const org2 = await createTestOrg(prisma);

    const admin = await createTestUser(prisma, org1.id, { role: UserRole.ADMIN });
    // Crear usuario en org2
    await createTestUser(prisma, org2.id, { name: 'User Org2' });

    const token = generateTestToken(jwtService, {
      sub: admin.id,
      orgId: org1.id,
      role: 'ADMIN',
    });

    const res = await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const names = res.body.data.map((u: { name: string }) => u.name);
    expect(names).not.toContain('User Org2');
  });
});

describe('POST /api/users', () => {
  it('should return 201 with valid payload', async () => {
    const org = await createTestOrg(prisma);
    const admin = await createTestUser(prisma, org.id, { role: UserRole.ADMIN });
    const token = generateTestToken(jwtService, {
      sub: admin.id,
      orgId: org.id,
      role: 'ADMIN',
    });

    const res = await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Nuevo Empleado',
        identification_number: 'CC-99999',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Nuevo Empleado');
  });

  it('should return 409 when identification_number is duplicated', async () => {
    const org = await createTestOrg(prisma);
    const admin = await createTestUser(prisma, org.id, { role: UserRole.ADMIN });
    const token = generateTestToken(jwtService, {
      sub: admin.id,
      orgId: org.id,
      role: 'ADMIN',
    });

    await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Primero', identification_number: 'CC-DUP' });

    const res = await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Segundo', identification_number: 'CC-DUP' })
      .expect(409);

    expect(res.body.success).toBe(false);
  });

  it('should return 400 when name is missing', async () => {
    const org = await createTestOrg(prisma);
    const admin = await createTestUser(prisma, org.id, { role: UserRole.ADMIN });
    const token = generateTestToken(jwtService, {
      sub: admin.id,
      orgId: org.id,
      role: 'ADMIN',
    });

    const res = await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ identification_number: 'CC-12345' })
      .expect(400);

    expect(res.body.success).toBe(false);
  });
});
