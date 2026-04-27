import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { AttendanceService } from '../../../src/attendance/attendance.service';
import { AttendanceConfigService } from '../../../src/attendance/attendance-config.service';
import { AttendanceOvertimeService } from '../../../src/attendance/attendance-overtime.service';
import { RedisService } from '../../../src/redis/redis.service';
import { truncateAll } from '../../helpers/db-cleanup';
import {
  createTestOrg,
  createTestUser,
  createTestAttendanceConfig,
} from '../../helpers/factories';

const redisServiceMock = {
  getClient: jest.fn().mockReturnValue({
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(null),
  }),
  del: jest.fn().mockResolvedValue(undefined),
};

let testingModule: TestingModule;
let service: AttendanceService;
let prisma: PrismaService;

beforeAll(async () => {
  testingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ envFilePath: '.env.test', isGlobal: true }),
    ],
    providers: [
      AttendanceService,
      AttendanceConfigService,
      AttendanceOvertimeService,
      PrismaService,
      { provide: RedisService, useValue: redisServiceMock },
    ],
  }).compile();

  await testingModule.init();
  service = testingModule.get(AttendanceService);
  prisma = testingModule.get(PrismaService);
});

afterAll(async () => {
  await testingModule.close();
});

beforeEach(async () => {
  await truncateAll(prisma);
  // Reset redis mocks entre tests
  redisServiceMock.getClient.mockReturnValue({
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(null),
  });
  redisServiceMock.del.mockResolvedValue(undefined);
});

describe('AttendanceService — integration', () => {
  describe('registerEntry()', () => {
    it('should create an AttendanceRecord with open jornada', async () => {
      const org = await createTestOrg(prisma);
      const user = await createTestUser(prisma, org.id);
      await createTestAttendanceConfig(prisma, org.id);

      const record = await service.registerEntry(user.id, org.id);

      expect(record.user_id).toBe(user.id);
      expect(record.org_id).toBe(org.id);
      expect(record.entry_time).toBeDefined();
      expect(record.exit_time).toBeNull();
    });

    it('should throw ConflictException if there is already an open record for today', async () => {
      const org = await createTestOrg(prisma);
      const user = await createTestUser(prisma, org.id);
      await createTestAttendanceConfig(prisma, org.id);

      // Primera entrada
      await service.registerEntry(user.id, org.id);

      // Segunda entrada el mismo día debe fallar
      // El lock de Redis retorna null para simular que ya está tomado
      redisServiceMock.getClient.mockReturnValue({
        set: jest.fn().mockResolvedValue(null), // NX falla → lock no adquirido
        del: jest.fn().mockResolvedValue(1),
        get: jest.fn().mockResolvedValue(null),
      });

      await expect(service.registerEntry(user.id, org.id)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('registerExit()', () => {
    it('should close the record and persist overtime fields', async () => {
      const org = await createTestOrg(prisma);
      const user = await createTestUser(prisma, org.id);
      await createTestAttendanceConfig(prisma, org.id);

      // Abrir entrada
      const entryRecord = await service.registerEntry(user.id, org.id);
      expect(entryRecord.exit_time).toBeNull();

      // Esperar un momento para que haya diferencia de tiempo
      await new Promise((r) => setTimeout(r, 50));

      // Registrar salida
      const exitRecord = await service.registerExit(user.id, org.id);

      expect(exitRecord.exit_time).not.toBeNull();
      expect(exitRecord.total_minutes).toBeGreaterThanOrEqual(0);
      expect(exitRecord.regular_minutes).toBeGreaterThanOrEqual(0);
      // Campos de overtime deben existir (pueden ser 0)
      expect(exitRecord.extra_day_minutes).toBeDefined();
      expect(exitRecord.extra_night_minutes).toBeDefined();
      expect(exitRecord.extra_sunday_minutes).toBeDefined();
      expect(exitRecord.extra_holiday_minutes).toBeDefined();
    });

    it('should throw NotFoundException when no open entry exists', async () => {
      const org = await createTestOrg(prisma);
      const user = await createTestUser(prisma, org.id);
      await createTestAttendanceConfig(prisma, org.id);

      await expect(service.registerExit(user.id, org.id)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
