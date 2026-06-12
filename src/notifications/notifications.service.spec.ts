import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import {
  NotificationsService,
  NOTIFICATION_CHANNEL,
} from './notifications.service';

// ═══════════════════════════════════════════════════════════════════════════════
// MOCKS MANUALES
// ═══════════════════════════════════════════════════════════════════════════════

const mockNotificationCreate = jest.fn();
const mockNotificationFindUnique = jest.fn();
const mockNotificationUpdate = jest.fn();
const mockNotificationUpdateMany = jest.fn();
const mockNotificationFindMany = jest.fn();
const mockNotificationCount = jest.fn();
const mockUserFindMany = jest.fn();
const mockWorkLocationFindFirst = jest.fn();
const mockTransactionFn = jest.fn();

const mockPublish = jest.fn();

const prisma = {
  notification: {
    create: mockNotificationCreate,
    findUnique: mockNotificationFindUnique,
    update: mockNotificationUpdate,
    updateMany: mockNotificationUpdateMany,
    findMany: mockNotificationFindMany,
    count: mockNotificationCount,
  },
  user: {
    findMany: mockUserFindMany,
  },
  workLocation: {
    findFirst: mockWorkLocationFindFirst,
  },
  $transaction: mockTransactionFn,
} as any;

const redis = {
  getClient: jest.fn().mockReturnValue({
    publish: mockPublish,
  }),
} as any;

// ═══════════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════════

const NOW = new Date('2026-06-10T12:00:00.000Z');

type NotificationFixture = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  deep_link: string;
  read: boolean;
  read_at: Date | null;
  created_at: Date;
  created_by_admin_id: string | null;
};

function buildNotification(overrides: Partial<NotificationFixture> = {}): NotificationFixture {
  return {
    id: 'notif-001',
    user_id: 'user-1',
    type: NotificationType.FORM_APPROVED,
    title: 'Formulario aprobado',
    body: 'Tu permiso fue aprobado',
    deep_link: '/form/sub-1',
    read: false,
    read_at: null,
    created_at: NOW,
    created_by_admin_id: null,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE
// ═══════════════════════════════════════════════════════════════════════════════

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotificationsService(prisma, redis);

    mockPublish.mockResolvedValue(undefined);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // create — publica en Redis
  // ───────────────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a notification in the database', async () => {
      const notif = buildNotification();
      mockNotificationCreate.mockResolvedValue(notif);

      await service.create({
        user_id: 'user-1',
        type: NotificationType.FORM_APPROVED,
        title: 'Formulario aprobado',
        body: 'Tu permiso fue aprobado',
        deep_link: '/form/sub-1',
      });

      expect(mockNotificationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            user_id: 'user-1',
            type: NotificationType.FORM_APPROVED,
            title: 'Formulario aprobado',
            body: 'Tu permiso fue aprobado',
          }),
        }),
      );
    });

    it('should publish to the Redis notification.created channel after creating', async () => {
      const notif = buildNotification();
      mockNotificationCreate.mockResolvedValue(notif);

      await service.create({
        user_id: 'user-1',
        type: NotificationType.FORM_APPROVED,
        title: 'Formulario aprobado',
        body: 'Tu permiso fue aprobado',
      });

      expect(mockPublish).toHaveBeenCalledWith(
        NOTIFICATION_CHANNEL,
        expect.stringContaining('notif-001'),
      );
    });

    it('should publish a JSON payload containing notificationId, userId, type and title', async () => {
      const notif = buildNotification();
      mockNotificationCreate.mockResolvedValue(notif);

      await service.create({
        user_id: 'user-1',
        type: NotificationType.FORM_APPROVED,
        title: 'Formulario aprobado',
        body: 'Tu permiso fue aprobado',
      });

      const publishedPayload = JSON.parse(mockPublish.mock.calls[0][1] as string);
      expect(publishedPayload).toMatchObject({
        notificationId: 'notif-001',
        userId: 'user-1',
        type: NotificationType.FORM_APPROVED,
        title: 'Formulario aprobado',
      });
    });

    it('should return the created notification', async () => {
      const notif = buildNotification();
      mockNotificationCreate.mockResolvedValue(notif);

      const result = await service.create({
        user_id: 'user-1',
        type: NotificationType.FORM_APPROVED,
        title: 'Formulario aprobado',
        body: 'Tu permiso fue aprobado',
      });

      expect(result.id).toBe('notif-001');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // markAsRead — ownership
  // ───────────────────────────────────────────────────────────────────────────

  describe('markAsRead', () => {
    it('should throw NotFoundException when notification does not exist', async () => {
      mockNotificationFindUnique.mockResolvedValue(null);

      await expect(
        service.markAsRead('nonexistent-id', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when notification belongs to a different user (ownership violation)', async () => {
      mockNotificationFindUnique.mockResolvedValue(
        buildNotification({ user_id: 'user-other' }),
      );

      await expect(
        service.markAsRead('notif-001', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return the notification unchanged when already read (idempotente)', async () => {
      const alreadyRead = buildNotification({ read: true, read_at: NOW });
      mockNotificationFindUnique.mockResolvedValue(alreadyRead);

      const result = await service.markAsRead('notif-001', 'user-1');

      // No debe llamar a update
      expect(mockNotificationUpdate).not.toHaveBeenCalled();
      expect(result.read).toBe(true);
    });

    it('should update read=true and read_at when notification is unread and user owns it', async () => {
      mockNotificationFindUnique.mockResolvedValue(buildNotification({ read: false }));
      mockNotificationUpdate.mockResolvedValue(buildNotification({ read: true, read_at: NOW }));

      await service.markAsRead('notif-001', 'user-1');

      expect(mockNotificationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'notif-001' },
          data: expect.objectContaining({ read: true, read_at: expect.any(Date) }),
        }),
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // markAllAsRead
  // ───────────────────────────────────────────────────────────────────────────

  describe('markAllAsRead', () => {
    it('should call updateMany filtering by user_id and read=false', async () => {
      mockNotificationUpdateMany.mockResolvedValue({ count: 3 });

      const result = await service.markAllAsRead('user-1');

      expect(mockNotificationUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: 'user-1', read: false },
          data: expect.objectContaining({ read: true }),
        }),
      );
      expect(result).toEqual({ updated: 3 });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // findAllForUser
  // ───────────────────────────────────────────────────────────────────────────

  describe('findAllForUser', () => {
    it('should return paginated notifications with unreadCount', async () => {
      const items = [buildNotification(), buildNotification({ id: 'notif-002', read: true })];
      mockTransactionFn.mockResolvedValue([items, 2, 1]);

      const result = await service.findAllForUser('user-1', { unreadOnly: false, page: 1, limit: 20 });

      expect(result).toMatchObject({
        items,
        total: 2,
        page: 1,
        limit: 20,
        unreadCount: 1,
      });
    });
  });
});
