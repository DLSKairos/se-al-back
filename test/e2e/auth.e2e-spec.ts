import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });

import * as request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { ResponseTransformInterceptor } from '../../src/common/interceptors/response-transform.interceptor';
import { PrismaService } from '../../src/prisma/prisma.service';
import { truncateAll } from '../helpers/db-cleanup';
import { createTestOrg, createTestUser } from '../helpers/factories';

let app: INestApplication;
let prisma: PrismaService;

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
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await truncateAll(prisma);
});

describe('POST /api/auth/pin/init', () => {
  it('should create PIN and return access_token for user without PIN', async () => {
    const org = await createTestOrg(prisma);
    const user = await createTestUser(prisma, org.id, {
      identification_number: 'USER-NPIN-001',
    });

    const res = await request(app.getHttpServer())
      .post('/api/auth/pin/init')
      .send({
        identification_number: user.identification_number,
        pin: '123456',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.access_token).toBeDefined();
  });

  it('should return 409 if user already has a PIN configured', async () => {
    const org = await createTestOrg(prisma);
    const user = await createTestUser(prisma, org.id, {
      identification_number: 'USER-HAS-PIN',
    });

    // Init por primera vez
    await request(app.getHttpServer())
      .post('/api/auth/pin/init')
      .send({ identification_number: user.identification_number, pin: '1234' });

    // Segundo intento debe fallar
    const res = await request(app.getHttpServer())
      .post('/api/auth/pin/init')
      .send({ identification_number: user.identification_number, pin: '5678' })
      .expect(409);

    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/auth/pin/verify', () => {
  it('should return access_token with correct PIN', async () => {
    const org = await createTestOrg(prisma);
    const user = await createTestUser(prisma, org.id, {
      identification_number: 'USER-VERIFY-001',
    });

    // Configurar PIN primero
    await request(app.getHttpServer())
      .post('/api/auth/pin/init')
      .send({ identification_number: user.identification_number, pin: '4321' });

    const res = await request(app.getHttpServer())
      .post('/api/auth/pin/verify')
      .send({
        identification_number: user.identification_number,
        pin: '4321',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.access_token).toBeDefined();
  });

  it('should return 401 with incorrect PIN', async () => {
    const org = await createTestOrg(prisma);
    const user = await createTestUser(prisma, org.id, {
      identification_number: 'USER-WRONG-PIN',
    });

    // Configurar PIN primero
    await request(app.getHttpServer())
      .post('/api/auth/pin/init')
      .send({ identification_number: user.identification_number, pin: '9999' });

    const res = await request(app.getHttpServer())
      .post('/api/auth/pin/verify')
      .send({
        identification_number: user.identification_number,
        pin: '0000', // PIN incorrecto
      })
      .expect(401);

    expect(res.body.success).toBe(false);
  });

  it('should return 400 with invalid PIN format (non-numeric)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/pin/verify')
      .send({
        identification_number: 'ANYONE',
        pin: 'abcd',
      })
      .expect(400);

    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/auth/pin/status', () => {
  it('should return pinEnabled=false and pinConfigured=false for new user', async () => {
    const org = await createTestOrg(prisma);
    const user = await createTestUser(prisma, org.id, {
      identification_number: 'USER-STATUS-001',
    });

    const res = await request(app.getHttpServer())
      .post('/api/auth/pin/status')
      .send({ identification_number: user.identification_number })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.pinEnabled).toBe(false);
    expect(res.body.data.pinConfigured).toBe(false);
  });

  it('should return 404 for unknown identification_number', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/pin/status')
      .send({ identification_number: 'NONEXISTENT-99999' })
      .expect(404);

    expect(res.body.success).toBe(false);
  });
});
