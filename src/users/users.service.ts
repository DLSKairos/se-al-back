import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { hashToken, randomToken } from '../common/utils/token.util';

/** Vigencia del código de activación de primer acceso (Fix C2). */
const ACTIVATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Invalida el cache de estado de auth de un usuario para que los cambios de
   * rol / desactivación surtan efecto inmediato en JwtStrategy (Fix M1).
   */
  private async invalidateAuthState(userId: string): Promise<void> {
    await this.redis.del(`user:auth-state:${userId}`);
  }

  /**
   * Fix seguridad C2: genera un código de activación de un solo uso para el
   * primer acceso (PIN/biométrico). Devuelve el código en claro (para que el
   * admin lo comparta por un canal fuera de banda) y persiste solo su hash.
   */
  async issueActivationCode(
    userId: string,
    orgId: string,
  ): Promise<{ activation_code: string; expires_at: Date }> {
    await this.assertExists(userId, orgId);

    const code = randomToken(24);
    const expiresAt = new Date(Date.now() + ACTIVATION_TTL_MS);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        activation_code_hash: hashToken(code),
        activation_expires_at: expiresAt,
      },
    });

    return { activation_code: code, expires_at: expiresAt };
  }

  // ─── Consultas ─────────────────────────────────────────────────────────────

  async findAll(orgId: string) {
    return this.prisma.user.findMany({
      where: { org_id: orgId, is_active: true },
      select: {
        id: true,
        org_id: true,
        name: true,
        identification_number: true,
        job_title: true,
        role: true,
        is_active: true,
        pin_enabled: true,
        work_location_id: true,
        created_at: true,
        work_location: true,
        // pin_hash excluido intencionalmente (Fix #2)
        // push_subscription excluido: contiene datos del dispositivo (Fix #2)
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, orgId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, org_id: orgId },
      select: {
        id: true,
        org_id: true,
        name: true,
        identification_number: true,
        job_title: true,
        role: true,
        is_active: true,
        pin_enabled: true,
        work_location_id: true,
        created_at: true,
        work_location: true,
        webauthn_credentials: {
          select: {
            id: true,
            credential_id: true,
            authenticator_type: true,
            registered_at: true,
          },
        },
        // pin_hash y push_subscription excluidos intencionalmente (Fix #2)
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return user;
  }

  // ─── Mutaciones ────────────────────────────────────────────────────────────

  /**
   * Reglas de asignación de rol (Fix seguridad C1):
   * - SUPER_ADMIN nunca puede asignarse desde la API de gestión.
   * - Solo un SUPER_ADMIN puede otorgar el rol ADMIN a otro usuario.
   * `requesterRole` es el rol del usuario autenticado que ejecuta la acción.
   */
  private assertCanAssignRole(role: UserRole | undefined, requesterRole: string) {
    if (role === undefined) return;

    if (role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'No es posible asignar el rol SUPER_ADMIN desde este endpoint',
      );
    }

    if (role === UserRole.ADMIN && requesterRole !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Solo un SUPER_ADMIN puede otorgar el rol ADMIN',
      );
    }
  }

  async create(orgId: string, dto: CreateUserDto, requesterRole: string) {
    // Validar unicidad del número de identificación
    const existing = await this.prisma.user.findUnique({
      where: { identification_number: dto.identification_number },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe un usuario con el número de identificación ${dto.identification_number}`,
      );
    }

    // Validar que el rol sea válido y permitido para el solicitante
    if (dto.role && !Object.values(UserRole).includes(dto.role as UserRole)) {
      throw new BadRequestException(`Rol inválido: ${dto.role}`);
    }
    this.assertCanAssignRole(dto.role as UserRole | undefined, requesterRole);

    // Fix seguridad C2: se emite un código de activación de un solo uso para el
    // primer acceso, que el admin debe entregar al trabajador por un canal
    // fuera de banda. El código en claro se devuelve UNA sola vez.
    const activationCode = randomToken(24);
    const activationExpiresAt = new Date(Date.now() + ACTIVATION_TTL_MS);

    const user = await this.prisma.user.create({
      data: {
        org_id: orgId,
        name: dto.name,
        identification_number: dto.identification_number,
        job_title: dto.job_title || 'Sin cargo',
        role: (dto.role as UserRole) ?? UserRole.OPERATOR,
        work_location_id: dto.work_location_id || null,
        activation_code_hash: hashToken(activationCode),
        activation_expires_at: activationExpiresAt,
      },
      include: { work_location: true },
    });

    return {
      ...user,
      activation_code: activationCode,
      activation_expires_at: activationExpiresAt,
    };
  }

  async update(
    id: string,
    orgId: string,
    dto: UpdateUserDto,
    requesterRole: string,
  ) {
    await this.assertExists(id, orgId);

    // Fix seguridad C1: impedir escalada de privilegios vía cambio de rol.
    this.assertCanAssignRole(dto.role as UserRole | undefined, requesterRole);

    // Si cambia el número de identificación, verificar unicidad
    if (dto.identification_number) {
      const conflict = await this.prisma.user.findFirst({
        where: {
          identification_number: dto.identification_number,
          NOT: { id },
        },
      });
      if (conflict) {
        throw new ConflictException(
          `Ya existe otro usuario con el número de identificación ${dto.identification_number}`,
        );
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.identification_number !== undefined && {
          identification_number: dto.identification_number,
        }),
        ...(dto.job_title !== undefined && { job_title: dto.job_title }),
        ...(dto.role !== undefined && { role: dto.role as UserRole }),
        ...(dto.work_location_id !== undefined && {
          work_location_id: dto.work_location_id,
        }),
      },
      include: { work_location: true },
    });

    // Fix M1: propagar cambios de rol de inmediato invalidando el cache de auth.
    await this.invalidateAuthState(id);
    return updated;
  }

  async setPinEnabled(
    id: string,
    orgId: string,
    enabled: boolean,
  ): Promise<void> {
    await this.assertExists(id, orgId);

    await this.prisma.user.update({
      where: { id },
      data: {
        pin_enabled: enabled,
        // Al deshabilitar, limpiar el hash por seguridad
        ...(enabled === false && { pin_hash: null }),
      },
    });
  }

  async softDelete(id: string, orgId: string): Promise<void> {
    await this.assertExists(id, orgId);

    await this.prisma.user.update({
      where: { id },
      data: { is_active: false },
    });

    // Fix M1: revocar el acceso de inmediato (no esperar al TTL del JWT).
    await this.invalidateAuthState(id);
  }

  async listWebAuthnCredentials(userId: string, orgId: string) {
    await this.assertExists(userId, orgId);

    return this.prisma.webAuthnCredential.findMany({
      where: { user_id: userId },
      select: {
        id: true,
        credential_id: true,
        authenticator_type: true,
        registered_at: true,
      },
      orderBy: { registered_at: 'desc' },
    });
  }

  async revokeWebAuthnCredential(
    userId: string,
    credentialId: string,
    orgId: string,
  ): Promise<void> {
    // Verificar que el usuario pertenece a la org
    await this.assertExists(userId, orgId);

    const credential = await this.prisma.webAuthnCredential.findFirst({
      where: { id: credentialId, user_id: userId },
    });

    if (!credential) {
      throw new NotFoundException('Credencial WebAuthn no encontrada');
    }

    await this.prisma.webAuthnCredential.delete({
      where: { id: credentialId },
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async assertExists(id: string, orgId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id, org_id: orgId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
  }
}
