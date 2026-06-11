import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MagicLinkPurpose, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { NotificationsService } from '../notifications/notifications.service';

// NotificationsService — interfaz pactada con el agente de notificaciones.
// Importamos el tipo pero el módulo se proveerá opcionalmente para evitar
// dependencias circulares al momento del arranque paralelo.
interface INotificationsService {
  create(dto: {
    user_id: string;
    type: string;
    title: string;
    body: string;
    deep_link?: string;
    created_by_admin_id?: string;
  }): Promise<unknown>;
}

export interface MagicLinkValidateResult {
  valid: boolean;
  userId?: string;
  adminName?: string;
  orgName?: string;
  purpose?: MagicLinkPurpose;
  error?: 'TOKEN_NOT_FOUND' | 'TOKEN_EXPIRED' | 'TOKEN_ALREADY_USED';
}

@Injectable()
export class MagicLinkService {
  private readonly logger = new Logger(MagicLinkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly featureFlags: FeatureFlagsService,
    @Inject(NotificationsService)
    private readonly notificationsService: INotificationsService,
  ) {}

  // ─── Helpers privados ────────────────────────────────────────────────────────

  private buildLink(token: string): string {
    const base = this.config.get<string>('MAGIC_LINK_BASE_URL', 'http://localhost:4000');
    return `${base}/activar?token=${token}`;
  }

  private async checkFlag(): Promise<void> {
    const enabled = await this.featureFlags.isEnabled('magic_link');
    if (!enabled) {
      throw new ForbiddenException(
        'El sistema de magic links no está habilitado en este momento.',
      );
    }
  }

  private async resolveUserWithOrg(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { org: true },
    });
    if (!user) throw new NotFoundException(`Usuario ${userId} no encontrado.`);
    return user;
  }

  // ─── generateFirstAdminLink ──────────────────────────────────────────────────

  /**
   * SUPER_ADMIN genera el link de primer acceso para un admin de una empresa cliente.
   * El target debe tener rol ADMIN y contar con email registrado.
   */
  async generateFirstAdminLink(
    targetUserId: string,
    createdBySuperAdminId: string,
  ): Promise<{ link: string; tokenId: string }> {
    await this.checkFlag();

    // Verificar que quien llama es SUPER_ADMIN
    const caller = await this.prisma.user.findUnique({
      where: { id: createdBySuperAdminId },
    });
    if (!caller || caller.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Solo un SUPER_ADMIN puede generar este tipo de link.');
    }

    const target = await this.resolveUserWithOrg(targetUserId);

    if (target.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'El usuario destino debe tener rol ADMIN para recibir un link de primer acceso.',
      );
    }
    if (!target.email) {
      throw new ForbiddenException(
        'El usuario destino no tiene email registrado. Añade el email antes de enviar el magic link.',
      );
    }

    // Expiración: 72 horas
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

    const magicLinkToken = await this.prisma.magicLinkToken.create({
      data: {
        user_id: targetUserId,
        purpose: MagicLinkPurpose.FIRST_ACCESS_ADMIN,
        expires_at: expiresAt,
        created_by_super_admin: true,
      },
    });

    const link = this.buildLink(magicLinkToken.token);

    this.logger.log(
      `[MagicLink] FIRST_ACCESS_ADMIN generado — target: ${targetUserId}, ` +
        `createdBy: ${createdBySuperAdminId}, tokenId: ${magicLinkToken.id}`,
    );

    // Enviar email
    await this.mail.sendMagicLinkFirstAccess(target.email, {
      adminName: target.name,
      orgName: target.org.name,
      link,
    });

    // Crear notificación en-app (si el servicio ya está disponible)
    await this.notificationsService?.create({
      user_id: targetUserId,
      type: 'MAGIC_LINK_SENT',
      title: 'Tu acceso a SEÑAL está listo',
      body: `Hemos enviado un enlace de activación a ${target.email}. Es válido por 72 horas.`,
      deep_link: '/activar',
      created_by_admin_id: createdBySuperAdminId,
    });

    return { link, tokenId: magicLinkToken.id };
  }

  // ─── generateAdminInviteLink ────────────────────────────────────────────────

  /**
   * ADMIN o SUPER_ADMIN invita a un nuevo administrador de la misma organización.
   */
  async generateAdminInviteLink(
    targetUserId: string,
    createdByAdminId: string,
  ): Promise<{ link: string; tokenId: string }> {
    await this.checkFlag();

    const caller = await this.prisma.user.findUnique({
      where: { id: createdByAdminId },
    });
    if (
      !caller ||
      (caller.role !== UserRole.ADMIN && caller.role !== UserRole.SUPER_ADMIN)
    ) {
      throw new ForbiddenException(
        'Solo un ADMIN o SUPER_ADMIN puede generar links de invitación.',
      );
    }

    const target = await this.resolveUserWithOrg(targetUserId);

    if (target.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'El usuario destino debe tener rol ADMIN para recibir una invitación.',
      );
    }
    if (!target.email) {
      throw new ForbiddenException(
        'El usuario destino no tiene email registrado.',
      );
    }

    // ADMIN solo puede invitar dentro de su propia organización
    if (caller.role === UserRole.ADMIN && caller.org_id !== target.org_id) {
      throw new ForbiddenException(
        'No puedes invitar a un usuario de otra organización.',
      );
    }

    // Expiración: 48 horas
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const magicLinkToken = await this.prisma.magicLinkToken.create({
      data: {
        user_id: targetUserId,
        purpose: MagicLinkPurpose.ADMIN_INVITE,
        expires_at: expiresAt,
        created_by_super_admin: caller.role === UserRole.SUPER_ADMIN,
      },
    });

    const link = this.buildLink(magicLinkToken.token);

    this.logger.log(
      `[MagicLink] ADMIN_INVITE generado — target: ${targetUserId}, ` +
        `createdBy: ${createdByAdminId}, tokenId: ${magicLinkToken.id}`,
    );

    await this.mail.sendMagicLinkInvite(target.email, {
      adminName: target.name,
      orgName: target.org.name,
      link,
    });

    await this.notificationsService?.create({
      user_id: targetUserId,
      type: 'MAGIC_LINK_SENT',
      title: 'Has sido invitado como administrador',
      body: `Hemos enviado una invitación a ${target.email}. Es válida por 48 horas.`,
      deep_link: '/activar',
      created_by_admin_id: createdByAdminId,
    });

    return { link, tokenId: magicLinkToken.id };
  }

  // ─── validate (sin consumir) ────────────────────────────────────────────────

  /**
   * Valida el token sin marcarlo como usado.
   * Permite al frontend mostrar la pantalla de activación (nombre/empresa)
   * antes de que el usuario complete el flujo OAuth.
   */
  async validate(token: string): Promise<MagicLinkValidateResult> {
    const record = await this.prisma.magicLinkToken.findUnique({
      where: { token },
      include: { user: { include: { org: true } } },
    });

    if (!record) {
      return { valid: false, error: 'TOKEN_NOT_FOUND' };
    }

    if (record.used_at) {
      return { valid: false, error: 'TOKEN_ALREADY_USED' };
    }

    if (record.expires_at < new Date()) {
      return { valid: false, error: 'TOKEN_EXPIRED' };
    }

    return {
      valid: true,
      userId: record.user_id,
      adminName: record.user.name,
      orgName: record.user.org.name,
      purpose: record.purpose,
    };
  }

  // ─── validateAndConsume ──────────────────────────────────────────────────────

  /**
   * Valida el token y lo marca como usado (idempotente).
   * Si ya fue usado → lanza UnauthorizedException con código TOKEN_ALREADY_USED.
   * Si expiró → lanza UnauthorizedException con código TOKEN_EXPIRED.
   */
  async validateAndConsume(token: string): Promise<{
    userId: string;
    adminName: string;
    orgName: string;
    purpose: MagicLinkPurpose;
  }> {
    const record = await this.prisma.magicLinkToken.findUnique({
      where: { token },
      include: { user: { include: { org: true } } },
    });

    if (!record) {
      throw new UnauthorizedException({
        code: 'TOKEN_NOT_FOUND',
        message: 'El enlace de activación no existe.',
      });
    }

    if (record.used_at) {
      throw new UnauthorizedException({
        code: 'TOKEN_ALREADY_USED',
        message: 'Este enlace ya fue utilizado. Solicita uno nuevo si es necesario.',
      });
    }

    if (record.expires_at < new Date()) {
      throw new UnauthorizedException({
        code: 'TOKEN_EXPIRED',
        message: 'El enlace de activación ha expirado. Solicita uno nuevo.',
      });
    }

    // Marcar como usado
    await this.prisma.magicLinkToken.update({
      where: { id: record.id },
      data: { used_at: new Date() },
    });

    this.logger.log(
      `[MagicLink] Token consumido — userId: ${record.user_id}, ` +
        `purpose: ${record.purpose}, tokenId: ${record.id}`,
    );

    return {
      userId: record.user_id,
      adminName: record.user.name,
      orgName: record.user.org.name,
      purpose: record.purpose,
    };
  }

  // ─── resendLink ──────────────────────────────────────────────────────────────

  /**
   * Invalida el token anterior y genera uno nuevo con el mismo propósito y target.
   */
  async resendLink(
    tokenId: string,
    requestedByAdminId: string,
  ): Promise<{ link: string; tokenId: string }> {
    await this.checkFlag();

    const existing = await this.prisma.magicLinkToken.findUnique({
      where: { id: tokenId },
      include: { user: { include: { org: true } } },
    });

    if (!existing) {
      throw new NotFoundException(`Token ${tokenId} no encontrado.`);
    }

    const caller = await this.prisma.user.findUnique({
      where: { id: requestedByAdminId },
    });
    if (
      !caller ||
      (caller.role !== UserRole.ADMIN && caller.role !== UserRole.SUPER_ADMIN)
    ) {
      throw new ForbiddenException('Permiso insuficiente para reenviar el link.');
    }

    // ADMIN solo dentro de su org
    if (caller.role === UserRole.ADMIN && caller.org_id !== existing.user.org_id) {
      throw new ForbiddenException(
        'No puedes reenviar un link de usuario de otra organización.',
      );
    }

    // Invalidar el anterior marcándolo como used_at = now
    await this.prisma.magicLinkToken.update({
      where: { id: tokenId },
      data: { used_at: new Date() },
    });

    // Calcular nueva expiración según purpose
    const hoursMap: Record<MagicLinkPurpose, number> = {
      [MagicLinkPurpose.FIRST_ACCESS_ADMIN]: 72,
      [MagicLinkPurpose.ADMIN_INVITE]: 48,
    };
    const hours = hoursMap[existing.purpose] ?? 48;
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    const newToken = await this.prisma.magicLinkToken.create({
      data: {
        user_id: existing.user_id,
        purpose: existing.purpose,
        expires_at: expiresAt,
        created_by_super_admin: existing.created_by_super_admin,
      },
    });

    const link = this.buildLink(newToken.token);

    this.logger.log(
      `[MagicLink] Reenvío — prevTokenId: ${tokenId}, ` +
        `newTokenId: ${newToken.id}, userId: ${existing.user_id}, ` +
        `requestedBy: ${requestedByAdminId}`,
    );

    // Reenviar email
    if (!existing.user.email) {
      throw new ForbiddenException(
        'El usuario no tiene email registrado para reenviar el link.',
      );
    }

    if (existing.purpose === MagicLinkPurpose.FIRST_ACCESS_ADMIN) {
      await this.mail.sendMagicLinkFirstAccess(existing.user.email, {
        adminName: existing.user.name,
        orgName: existing.user.org.name,
        link,
      });
    } else {
      await this.mail.sendMagicLinkInvite(existing.user.email, {
        adminName: existing.user.name,
        orgName: existing.user.org.name,
        link,
      });
    }

    await this.notificationsService?.create({
      user_id: existing.user_id,
      type: 'MAGIC_LINK_SENT',
      title: 'Nuevo enlace de activación enviado',
      body: `Hemos enviado un nuevo enlace a ${existing.user.email}. Es válido por ${hours} horas.`,
      deep_link: '/activar',
      created_by_admin_id: requestedByAdminId,
    });

    return { link, tokenId: newToken.id };
  }

  // ─── historial por organización ─────────────────────────────────────────────

  async getHistoryByOrg(orgId: string) {
    return this.prisma.magicLinkToken.findMany({
      where: { user: { org_id: orgId } },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }
}
