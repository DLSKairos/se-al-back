import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MagicLinkService } from '../magic-link/magic-link.service';
import { CreateAdminDto } from './dto/create-admin.dto';

/**
 * AdminManagementService — gestión de administradores dentro de una organización.
 *
 * Reglas:
 * - Los ADMINs solo gestionan admins de su propia org (scope por orgId del JWT).
 * - SUPER_ADMIN puede gestionar admins de cualquier org.
 * - Un admin no puede desactivarse a sí mismo.
 * - Al crear un admin, se genera automáticamente el magic link de invitación.
 * - Email obligatorio para admins (a nivel de servicio; el schema lo admite nullable).
 */
@Injectable()
export class AdminManagementService {
  private readonly logger = new Logger(AdminManagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly magicLink: MagicLinkService,
  ) {}

  // ─── Crear admin ──────────────────────────────────────────────────────────

  async createAdmin(orgId: string, createdById: string, dto: CreateAdminDto) {
    // Verificar unicidad de email en la org
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email, org_id: orgId },
    });

    if (existing) {
      throw new ConflictException(
        'Ya existe un administrador con este email en la organización',
      );
    }

    // Si se proporciona identification_number, verificar unicidad global
    if (dto.identification_number) {
      const existingByDoc = await this.prisma.user.findUnique({
        where: { identification_number: dto.identification_number },
      });
      if (existingByDoc) {
        throw new ConflictException(
          'Ya existe un usuario con este número de identificación',
        );
      }
    }

    // Crear usuario como ADMIN inactivo (se activa al completar OAuth)
    const newAdmin = await this.prisma.user.create({
      data: {
        org_id: orgId,
        name: dto.name,
        email: dto.email,
        // identification_number requerido por el schema — usar placeholder si no se proporciona
        identification_number:
          dto.identification_number ?? `PENDING-${dto.email}`,
        role: 'ADMIN',
        is_active: false, // se activa al vincular OAuth
        pin_enabled: false,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        is_active: true,
        created_at: true,
      },
    });

    this.logger.log(
      `Admin creado: ${newAdmin.id} (${newAdmin.email}) en org ${orgId} por ${createdById}`,
    );

    // Generar magic link de invitación automáticamente
    let magicLinkResult: { token?: string; link?: string } = {};
    try {
      magicLinkResult = await this.magicLink.generateAdminInviteLink(
        newAdmin.id,
        createdById,
      );
    } catch (err) {
      this.logger.error(
        `Error generando magic link para admin ${newAdmin.id}: ${(err as Error).message}`,
      );
    }

    return {
      ...newAdmin,
      magic_link: magicLinkResult,
    };
  }

  // ─── Listar admins de la org ──────────────────────────────────────────────

  async findAdmins(orgId: string) {
    const admins = await this.prisma.user.findMany({
      where: { org_id: orgId, role: 'ADMIN' },
      select: {
        id: true,
        name: true,
        email: true,
        is_active: true,
        oauth_provider: true,
        oauth_provider_id: true,
        last_oauth_sync: true,
        created_at: true,
        magic_link_tokens: {
          orderBy: { created_at: 'desc' },
          take: 1,
          select: {
            id: true,
            purpose: true,
            expires_at: true,
            used_at: true,
            created_at: true,
          },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    return admins.map((admin) => ({
      ...admin,
      is_activated: !!admin.oauth_provider_id,
      last_magic_link: admin.magic_link_tokens[0] ?? null,
      magic_link_tokens: undefined,
    }));
  }

  // ─── Desactivar admin ─────────────────────────────────────────────────────

  async deactivateAdmin(
    targetId: string,
    orgId: string,
    requesterId: string,
  ) {
    if (targetId === requesterId) {
      throw new ForbiddenException('No puedes desactivar tu propia cuenta');
    }

    const admin = await this.prisma.user.findFirst({
      where: { id: targetId, org_id: orgId, role: 'ADMIN' },
    });

    if (!admin) {
      throw new NotFoundException('Administrador no encontrado');
    }

    await this.prisma.user.update({
      where: { id: targetId },
      data: { is_active: false },
    });

    this.logger.log(
      `Admin ${targetId} desactivado por ${requesterId} (org ${orgId})`,
    );

    return { success: true, message: 'Administrador desactivado exitosamente' };
  }

  // ─── Reactivar admin ──────────────────────────────────────────────────────

  async reactivateAdmin(
    targetId: string,
    orgId: string,
    requesterId: string,
  ) {
    const admin = await this.prisma.user.findFirst({
      where: { id: targetId, org_id: orgId, role: 'ADMIN' },
    });

    if (!admin) {
      throw new NotFoundException('Administrador no encontrado');
    }

    await this.prisma.user.update({
      where: { id: targetId },
      data: { is_active: true },
    });

    this.logger.log(
      `Admin ${targetId} reactivado por ${requesterId} (org ${orgId})`,
    );

    // Si no tiene OAuth vinculado, generar nuevo magic link de invitación
    if (!admin.oauth_provider_id) {
      try {
        const link = await this.magicLink.generateAdminInviteLink(
          targetId,
          requesterId,
        );
        return {
          success: true,
          message: 'Administrador reactivado. Se ha enviado un nuevo link de invitación.',
          magic_link: link,
        };
      } catch (err) {
        this.logger.error(
          `Error generando magic link al reactivar admin ${targetId}: ${(err as Error).message}`,
        );
      }
    }

    return { success: true, message: 'Administrador reactivado exitosamente' };
  }
}
