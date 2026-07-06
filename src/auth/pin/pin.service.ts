import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException, // usado en setPin
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PinRateLimiterService } from './pin-rate-limiter.service';
import { isActivationCodeValid } from '../../common/utils/token.util';

const BCRYPT_ROUNDS = 10;
const PIN_REGEX = /^\d{4,8}$/;

@Injectable()
export class PinService {
  private readonly logger = new Logger(PinService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimiter: PinRateLimiterService,
  ) {}

  /**
   * Devuelve si el PIN está habilitado y configurado para el usuario.
   * Nunca lanza 404 para evitar enumeración de usuarios (Fix #6).
   * Aplica rate limiting por IP (Fix #4).
   */
  async getStatus(
    identificationNumber: string,
    ip: string,
  ): Promise<{ pinEnabled: boolean; pinConfigured: boolean }> {
    const allowed = await this.rateLimiter.checkLimit(ip, identificationNumber);
    if (!allowed) {
      // Devolver false genérico sin revelar estado (no lanzar para no enumerar)
      return { pinEnabled: false, pinConfigured: false };
    }

    const user = await this.prisma.user.findUnique({
      where: { identification_number: identificationNumber },
      select: { pin_enabled: true, pin_hash: true },
    });

    if (!user) {
      // Respuesta genérica: no revelar si el usuario existe (Fix #6)
      return { pinEnabled: false, pinConfigured: false };
    }

    return {
      pinEnabled: user.pin_enabled,
      pinConfigured: user.pin_hash !== null,
    };
  }

  /**
   * Establece el PIN del usuario (hashea con bcrypt).
   * orgId restringe la búsqueda a la organización del admin (Fix #1).
   */
  async setPin(identificationNumber: string, pin: string, orgId: string): Promise<void> {
    this.validatePinFormat(pin);

    const user = await this.prisma.user.findFirst({
      where: { identification_number: identificationNumber, org_id: orgId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const pin_hash = await bcrypt.hash(pin, BCRYPT_ROUNDS);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { pin_hash, pin_enabled: true },
    });
  }

  /**
   * Verifica el PIN del usuario aplicando rate limiting por IP.
   * Retorna el usuario completo si el PIN es correcto.
   */
  async verifyPin(
    identificationNumber: string,
    pin: string,
    ip: string,
  ): Promise<User> {
    this.validatePinFormat(pin);

    const allowed = await this.rateLimiter.checkLimit(ip, identificationNumber);
    if (!allowed) {
      throw new UnauthorizedException(
        'Demasiados intentos fallidos. Intente nuevamente en 15 minutos.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { identification_number: identificationNumber },
    });

    if (!user || !user.is_active) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.pin_enabled || !user.pin_hash) {
      throw new UnauthorizedException('PIN no configurado para este usuario');
    }

    const isValid = await bcrypt.compare(pin, user.pin_hash);
    if (!isValid) {
      throw new UnauthorizedException('PIN incorrecto');
    }

    await this.rateLimiter.resetLimit(ip, identificationNumber);
    return user;
  }

  /**
   * Crea el PIN inicial de un usuario que aún no tiene PIN.
   * Solo se permite si pin_hash === null (nunca ha tenido PIN) Y el usuario
   * presenta un código de activación válido entregado por su administrador
   * fuera de banda (Fix seguridad C2 — evita toma de cuenta con solo la cédula).
   * Aplica rate limiting por IP (Fix #4) y por cuenta (Fix H2).
   * El código de activación se consume atómicamente al registrar el PIN.
   */
  async initPin(
    identificationNumber: string,
    pin: string,
    ip: string,
    activationCode: string,
  ): Promise<User> {
    this.validatePinFormat(pin);

    const allowed = await this.rateLimiter.checkLimit(ip, identificationNumber);
    if (!allowed) {
      throw new UnauthorizedException(
        'Demasiados intentos fallidos. Intente nuevamente en 15 minutos.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { identification_number: identificationNumber },
    });

    if (!user || !user.is_active) {
      throw new UnauthorizedException('Usuario no encontrado o inactivo');
    }

    if (user.pin_hash !== null) {
      throw new ConflictException(
        'Este usuario ya tiene PIN. Usa /auth/pin/verify para ingresar.',
      );
    }

    if (
      !isActivationCodeValid(
        user.activation_code_hash,
        user.activation_expires_at,
        activationCode,
      )
    ) {
      throw new UnauthorizedException(
        'Código de activación inválido o expirado. Solicita uno nuevo a tu administrador.',
      );
    }

    const pin_hash = await bcrypt.hash(pin, BCRYPT_ROUNDS);

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      // Consume el código de activación en la misma operación (un solo uso).
      data: {
        pin_hash,
        pin_enabled: true,
        activation_code_hash: null,
        activation_expires_at: null,
      },
    });

    await this.rateLimiter.resetLimit(ip, identificationNumber);
    return updated;
  }

  private validatePinFormat(pin: string): void {
    if (!PIN_REGEX.test(pin)) {
      throw new BadRequestException(
        'El PIN debe ser numérico y tener entre 4 y 8 dígitos',
      );
    }
  }
}
