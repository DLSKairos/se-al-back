import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Consultas ─────────────────────────────────────────────────────────────

  async findAll(orgId: string) {
    return this.prisma.user.findMany({
      where: { org_id: orgId, is_active: true },
      include: { work_location: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, orgId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, org_id: orgId },
      include: {
        work_location: true,
        webauthn_credentials: {
          select: {
            id: true,
            credential_id: true,
            authenticator_type: true,
            registered_at: true,
          },
        },
        push_subscription: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return user;
  }

  // ─── Mutaciones ────────────────────────────────────────────────────────────

  async create(orgId: string, dto: CreateUserDto) {
    // Validar unicidad del número de identificación
    const existing = await this.prisma.user.findUnique({
      where: { identification_number: dto.identification_number },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe un usuario con el número de identificación ${dto.identification_number}`,
      );
    }

    // Validar que el rol sea válido
    if (dto.role && !Object.values(UserRole).includes(dto.role as UserRole)) {
      throw new BadRequestException(`Rol inválido: ${dto.role}`);
    }

    return this.prisma.user.create({
      data: {
        org_id: orgId,
        name: dto.name,
        identification_number: dto.identification_number,
        job_title: dto.job_title ?? 'Sin cargo',
        role: (dto.role as UserRole) ?? UserRole.OPERATOR,
        work_location_id: dto.work_location_id ?? null,
      },
      include: { work_location: true },
    });
  }

  async update(id: string, orgId: string, dto: UpdateUserDto) {
    await this.assertExists(id, orgId);

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

    return this.prisma.user.update({
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
