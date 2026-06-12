import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { MagicLinkPurpose, UserRole } from '@prisma/client';
import { MagicLinkService } from './magic-link.service';

// ═══════════════════════════════════════════════════════════════════════════════
// MOCKS MANUALES
// ═══════════════════════════════════════════════════════════════════════════════

const mockUserFindUnique = jest.fn();
const mockMagicLinkTokenCreate = jest.fn();
const mockMagicLinkTokenFindUnique = jest.fn();
const mockMagicLinkTokenUpdate = jest.fn();

const prisma = {
  user: {
    findUnique: mockUserFindUnique,
  },
  magicLinkToken: {
    create: mockMagicLinkTokenCreate,
    findUnique: mockMagicLinkTokenFindUnique,
    update: mockMagicLinkTokenUpdate,
  },
} as any;

const mail = {
  sendMagicLinkFirstAccess: jest.fn().mockResolvedValue(undefined),
  sendMagicLinkInvite: jest.fn().mockResolvedValue(undefined),
} as any;

const config = {
  get: jest.fn().mockImplementation((key: string, fallback: unknown) => fallback),
} as any;

const featureFlags = {
  isEnabled: jest.fn().mockResolvedValue(true), // por defecto: feature activa
} as any;

const notificationsService = {
  create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
} as any;

// ═══════════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════════

const NOW = new Date('2026-06-10T12:00:00.000Z');
const FUTURE_72H = new Date(NOW.getTime() + 72 * 60 * 60 * 1000);
const PAST = new Date(NOW.getTime() - 60 * 60 * 1000);

const superAdmin = {
  id: 'super-1',
  role: UserRole.SUPER_ADMIN,
  org_id: 'org-kairos',
  email: 'super@kairos.co',
  name: 'Super Admin',
};

const adminUser = {
  id: 'admin-1',
  role: UserRole.ADMIN,
  org_id: 'org-client',
  email: 'admin@client.co',
  name: 'Admin Cliente',
  org: { id: 'org-client', name: 'Constructora XYZ' },
};

const operatorUser = {
  id: 'op-1',
  role: UserRole.OPERATOR,
  org_id: 'org-client',
  email: null,
  name: 'Operario Juan',
  org: { id: 'org-client', name: 'Constructora XYZ' },
};

type MagicLinkTokenFixture = {
  id: string;
  token: string;
  user_id: string;
  purpose: MagicLinkPurpose;
  expires_at: Date;
  used_at: Date | null;
  created_by_super_admin: boolean;
  created_at: Date;
  user: typeof adminUser;
};

function buildMagicLinkToken(overrides: Partial<MagicLinkTokenFixture> = {}): MagicLinkTokenFixture {
  return {
    id: 'ml-tok-1',
    token: 'secret-token-abc',
    user_id: 'admin-1',
    purpose: MagicLinkPurpose.FIRST_ACCESS_ADMIN,
    expires_at: FUTURE_72H,
    used_at: null,
    created_by_super_admin: true,
    created_at: NOW,
    user: adminUser,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE
// ═══════════════════════════════════════════════════════════════════════════════

describe('MagicLinkService', () => {
  let service: MagicLinkService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Restaurar el default del featureFlags mock después de clearAllMocks
    featureFlags.isEnabled.mockResolvedValue(true);
    service = new MagicLinkService(prisma, mail, config, featureFlags, notificationsService);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // generateFirstAdminLink
  // ───────────────────────────────────────────────────────────────────────────

  describe('generateFirstAdminLink', () => {
    beforeEach(() => {
      // El primer findUnique es el caller (superAdmin); el segundo es el target (adminUser)
      mockUserFindUnique
        .mockResolvedValueOnce(superAdmin)
        .mockResolvedValueOnce({ ...adminUser });
      mockMagicLinkTokenCreate.mockResolvedValue(buildMagicLinkToken());
    });

    it('should throw ForbiddenException when the caller is not a SUPER_ADMIN', async () => {
      mockUserFindUnique
        .mockReset()
        .mockResolvedValueOnce({ ...adminUser, id: 'admin-caller', role: UserRole.ADMIN });

      await expect(
        service.generateFirstAdminLink('admin-1', 'admin-caller'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when feature flag magic_link is disabled', async () => {
      featureFlags.isEnabled.mockResolvedValue(false);

      await expect(
        service.generateFirstAdminLink('admin-1', 'super-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when target user does not have ADMIN role', async () => {
      mockUserFindUnique
        .mockReset()
        .mockResolvedValueOnce(superAdmin)
        .mockResolvedValueOnce({ ...operatorUser });

      await expect(
        service.generateFirstAdminLink('op-1', 'super-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when target admin has no email', async () => {
      mockUserFindUnique
        .mockReset()
        .mockResolvedValueOnce(superAdmin)
        .mockResolvedValueOnce({ ...adminUser, email: null });

      await expect(
        service.generateFirstAdminLink('admin-1', 'super-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should create a MagicLinkToken with purpose FIRST_ACCESS_ADMIN and 72h expiry', async () => {
      await service.generateFirstAdminLink('admin-1', 'super-1');

      expect(mockMagicLinkTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            user_id: 'admin-1',
            purpose: MagicLinkPurpose.FIRST_ACCESS_ADMIN,
            created_by_super_admin: true,
            expires_at: expect.any(Date),
          }),
        }),
      );

      // Verificar que la expiración está aproximadamente 72h en el futuro
      const createdCall = mockMagicLinkTokenCreate.mock.calls[0][0];
      const expiresAt: Date = createdCall.data.expires_at;
      const diffHours = (expiresAt.getTime() - Date.now()) / (1000 * 3600);
      expect(diffHours).toBeGreaterThanOrEqual(71.9);
      expect(diffHours).toBeLessThanOrEqual(72.1);
    });

    it('should send the magic link email to the admin', async () => {
      await service.generateFirstAdminLink('admin-1', 'super-1');

      expect(mail.sendMagicLinkFirstAccess).toHaveBeenCalledWith(
        'admin@client.co',
        expect.objectContaining({
          adminName: 'Admin Cliente',
          orgName: 'Constructora XYZ',
          link: expect.stringContaining('/activar?token='),
        }),
      );
    });

    it('should create an in-app notification for the target user', async () => {
      await service.generateFirstAdminLink('admin-1', 'super-1');

      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'admin-1',
          type: 'MAGIC_LINK_SENT',
          created_by_admin_id: 'super-1',
        }),
      );
    });

    it('should return { link, tokenId }', async () => {
      const result = await service.generateFirstAdminLink('admin-1', 'super-1');

      expect(result).toHaveProperty('link');
      expect(result).toHaveProperty('tokenId', 'ml-tok-1');
      expect(result.link).toContain('/activar?token=');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // validate (sin consumir)
  // ───────────────────────────────────────────────────────────────────────────

  describe('validate', () => {
    it('should return { valid: false, error: TOKEN_NOT_FOUND } for unknown token', async () => {
      mockMagicLinkTokenFindUnique.mockResolvedValue(null);

      const result = await service.validate('unknown');

      expect(result).toEqual({ valid: false, error: 'TOKEN_NOT_FOUND' });
    });

    it('should return { valid: false, error: TOKEN_ALREADY_USED } for consumed token', async () => {
      mockMagicLinkTokenFindUnique.mockResolvedValue(
        buildMagicLinkToken({ used_at: PAST }),
      );

      const result = await service.validate('secret-token-abc');

      expect(result).toEqual({ valid: false, error: 'TOKEN_ALREADY_USED' });
    });

    it('should return { valid: false, error: TOKEN_EXPIRED } for expired token', async () => {
      mockMagicLinkTokenFindUnique.mockResolvedValue(
        buildMagicLinkToken({ expires_at: PAST }),
      );

      const result = await service.validate('secret-token-abc');

      expect(result).toEqual({ valid: false, error: 'TOKEN_EXPIRED' });
    });

    it('should return { valid: true, adminName, orgName, purpose } for valid token (S-07: sin userId)', async () => {
      mockMagicLinkTokenFindUnique.mockResolvedValue(buildMagicLinkToken());

      const result = await service.validate('secret-token-abc');

      // S-07: validate() público NO debe exponer userId
      expect((result as unknown as Record<string, unknown>).userId).toBeUndefined();
      expect(result).toMatchObject({
        valid: true,
        adminName: 'Admin Cliente',
        orgName: 'Constructora XYZ',
        purpose: MagicLinkPurpose.FIRST_ACCESS_ADMIN,
      });
    });

    it('should NOT update used_at when calling validate (does not consume)', async () => {
      mockMagicLinkTokenFindUnique.mockResolvedValue(buildMagicLinkToken());

      await service.validate('secret-token-abc');

      expect(mockMagicLinkTokenUpdate).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // validateAndConsume
  // ───────────────────────────────────────────────────────────────────────────

  describe('validateAndConsume', () => {
    it('should throw UnauthorizedException with TOKEN_NOT_FOUND for unknown token', async () => {
      mockMagicLinkTokenFindUnique.mockResolvedValue(null);

      const error = await service.validateAndConsume('unknown').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getResponse()).toMatchObject({
        code: 'TOKEN_NOT_FOUND',
      });
    });

    it('should throw UnauthorizedException with TOKEN_ALREADY_USED for used token', async () => {
      mockMagicLinkTokenFindUnique.mockResolvedValue(
        buildMagicLinkToken({ used_at: PAST }),
      );

      const error = await service.validateAndConsume('secret-token-abc').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getResponse()).toMatchObject({
        code: 'TOKEN_ALREADY_USED',
      });
    });

    it('should throw UnauthorizedException with TOKEN_EXPIRED for expired token', async () => {
      mockMagicLinkTokenFindUnique.mockResolvedValue(
        buildMagicLinkToken({ expires_at: PAST }),
      );

      const error = await service.validateAndConsume('secret-token-abc').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getResponse()).toMatchObject({
        code: 'TOKEN_EXPIRED',
      });
    });

    it('should mark the token as used (set used_at) for a valid token', async () => {
      mockMagicLinkTokenFindUnique.mockResolvedValue(buildMagicLinkToken());
      mockMagicLinkTokenUpdate.mockResolvedValue({});

      await service.validateAndConsume('secret-token-abc');

      expect(mockMagicLinkTokenUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ml-tok-1' },
          data: { used_at: expect.any(Date) },
        }),
      );
    });

    it('should return { userId, adminName, orgName, purpose } after consuming', async () => {
      mockMagicLinkTokenFindUnique.mockResolvedValue(buildMagicLinkToken());
      mockMagicLinkTokenUpdate.mockResolvedValue({});

      const result = await service.validateAndConsume('secret-token-abc');

      expect(result).toMatchObject({
        userId: 'admin-1',
        adminName: 'Admin Cliente',
        orgName: 'Constructora XYZ',
        purpose: MagicLinkPurpose.FIRST_ACCESS_ADMIN,
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // resendLink
  // ───────────────────────────────────────────────────────────────────────────

  describe('resendLink', () => {
    beforeEach(() => {
      // caller is SUPER_ADMIN
      mockUserFindUnique.mockResolvedValue(superAdmin);
      mockMagicLinkTokenFindUnique.mockResolvedValue(buildMagicLinkToken());
      mockMagicLinkTokenUpdate.mockResolvedValue({});
      mockMagicLinkTokenCreate.mockResolvedValue({
        ...buildMagicLinkToken(),
        id: 'ml-tok-new',
        token: 'new-token-xyz',
      });
    });

    it('should throw NotFoundException when tokenId does not exist', async () => {
      mockMagicLinkTokenFindUnique.mockResolvedValue(null);

      await expect(
        service.resendLink('nonexistent-id', 'super-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should invalidate the old token by setting used_at on it', async () => {
      await service.resendLink('ml-tok-1', 'super-1');

      expect(mockMagicLinkTokenUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ml-tok-1' },
          data: { used_at: expect.any(Date) },
        }),
      );
    });

    it('should create a new token with the same purpose and user', async () => {
      await service.resendLink('ml-tok-1', 'super-1');

      expect(mockMagicLinkTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            user_id: 'admin-1',
            purpose: MagicLinkPurpose.FIRST_ACCESS_ADMIN,
          }),
        }),
      );
    });

    it('should send the email with the new link', async () => {
      await service.resendLink('ml-tok-1', 'super-1');

      expect(mail.sendMagicLinkFirstAccess).toHaveBeenCalledTimes(1);
    });

    it('should create an in-app notification for the resend', async () => {
      await service.resendLink('ml-tok-1', 'super-1');

      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'admin-1',
          type: 'MAGIC_LINK_SENT',
        }),
      );
    });

    it('should return { link, tokenId } with the new token id', async () => {
      const result = await service.resendLink('ml-tok-1', 'super-1');

      expect(result).toHaveProperty('tokenId', 'ml-tok-new');
      expect(result).toHaveProperty('link');
    });

    it('should throw ForbiddenException when caller has insufficient role', async () => {
      mockUserFindUnique.mockResolvedValue({ ...operatorUser });

      await expect(
        service.resendLink('ml-tok-1', 'op-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
