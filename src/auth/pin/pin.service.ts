import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PinRateLimiterService } from './pin-rate-limiter.service';

const BCRYPT_ROUNDS = 10;
const PIN_REGEX = /^\d{4,8}$/;

@Injectable()
export class PinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimiter: PinRateLimiterService,
  ) {}

  /**
   * Devuelve si el PIN está habilitado y configurado para el usuario.
   */
  async getStatus(
    identificationNumber: string,
  ): Promise<{ pinEnabled: boolean; pinConfigured: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { identification_number: identificationNumber },
      select: { pin_enabled: true, pin_hash: true },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return {
      pinEnabled: user.pin_enabled,
      pinConfigured: user.pin_hash !== null,
    };
  }

  /**
   * Establece el PIN del usuario (hashea con bcrypt).
   */
  async setPin(identificationNumber: string, pin: string): Promise<void> {
    this.validatePinFormat(pin);

    const user = await this.prisma.user.findUnique({
      where: { identification_number: identificationNumber },
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

    const allowed = this.rateLimiter.checkLimit(ip);
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

    this.rateLimiter.resetLimit(ip);
    return user;
  }

  private validatePinFormat(pin: string): void {
    if (!PIN_REGEX.test(pin)) {
      throw new BadRequestException(
        'El PIN debe ser numérico y tener entre 4 y 8 dígitos',
      );
    }
  }
}
