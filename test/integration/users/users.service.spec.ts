import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { UsersService } from '../../../src/users/users.service';
import { truncateAll } from '../../helpers/db-cleanup';
import { createTestOrg, createTestUser } from '../../helpers/factories';
import { UserRole } from '@prisma/client';

let testingModule: TestingModule;
let service: UsersService;
let prisma: PrismaService;

beforeAll(async () => {
  testingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ envFilePath: '.env.test', isGlobal: true }),
    ],
    providers: [UsersService, PrismaService],
  }).compile();

  await testingModule.init();
  service = testingModule.get(UsersService);
  prisma = testingModule.get(PrismaService);
});

afterAll(async () => {
  await testingModule.close();
});

beforeEach(async () => {
  await truncateAll(prisma);
});

describe('UsersService — integration', () => {
  describe('create()', () => {
    it('should create a user with the correct org_id', async () => {
      const org = await createTestOrg(prisma);

      const user = await service.create(org.id, {
        name: 'Juan Pérez',
        identification_number: 'ID-001',
      });

      expect(user.org_id).toBe(org.id);
      expect(user.name).toBe('Juan Pérez');
      expect(user.identification_number).toBe('ID-001');
    });

    it('should default role to OPERATOR when not provided', async () => {
      const org = await createTestOrg(prisma);

      const user = await service.create(org.id, {
        name: 'Operador Default',
        identification_number: 'ID-002',
      });

      expect(user.role).toBe(UserRole.OPERATOR);
    });

    it('should throw ConflictException when identification_number is duplicated', async () => {
      const org = await createTestOrg(prisma);

      await service.create(org.id, {
        name: 'Primer Usuario',
        identification_number: 'ID-DUP',
      });

      await expect(
        service.create(org.id, {
          name: 'Segundo Usuario',
          identification_number: 'ID-DUP',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll()', () => {
    it('should return only active users of the requesting org', async () => {
      const org = await createTestOrg(prisma);
      await createTestUser(prisma, org.id, { name: 'User A' });
      await createTestUser(prisma, org.id, { name: 'User B' });

      const users = await service.findAll(org.id);

      expect(users).toHaveLength(2);
      expect(users.every((u) => u.org_id === org.id)).toBe(true);
    });

    it('should NOT return users from another org', async () => {
      const org1 = await createTestOrg(prisma);
      const org2 = await createTestOrg(prisma);

      await createTestUser(prisma, org2.id, { name: 'User org2' });

      const users = await service.findAll(org1.id);
      expect(users).toHaveLength(0);
    });

    it('should not return inactive users', async () => {
      const org = await createTestOrg(prisma);
      await createTestUser(prisma, org.id, { name: 'Active User' });
      await createTestUser(prisma, org.id, { name: 'Inactive User', is_active: false });

      const users = await service.findAll(org.id);
      expect(users).toHaveLength(1);
      expect(users[0].name).toBe('Active User');
    });
  });

  describe('findOne()', () => {
    it('should return the user when found in the correct org', async () => {
      const org = await createTestOrg(prisma);
      const created = await createTestUser(prisma, org.id, { name: 'Specific User' });

      const user = await service.findOne(created.id, org.id);
      expect(user.id).toBe(created.id);
    });

    it('should throw NotFoundException when user belongs to another org', async () => {
      const org1 = await createTestOrg(prisma);
      const org2 = await createTestOrg(prisma);
      const user = await createTestUser(prisma, org2.id, { name: 'org2 User' });

      await expect(service.findOne(user.id, org1.id)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      const org = await createTestOrg(prisma);
      await expect(service.findOne('nonexistent-id', org.id)).rejects.toThrow(NotFoundException);
    });
  });

  describe('softDelete()', () => {
    it('should set is_active to false on the user', async () => {
      const org = await createTestOrg(prisma);
      const user = await createTestUser(prisma, org.id);

      await service.softDelete(user.id, org.id);

      const updated = await prisma.user.findUnique({ where: { id: user.id } });
      expect(updated?.is_active).toBe(false);
    });

    it('should not appear in findAll after soft delete', async () => {
      const org = await createTestOrg(prisma);
      const user = await createTestUser(prisma, org.id);

      await service.softDelete(user.id, org.id);

      const users = await service.findAll(org.id);
      expect(users.find((u) => u.id === user.id)).toBeUndefined();
    });
  });
});
