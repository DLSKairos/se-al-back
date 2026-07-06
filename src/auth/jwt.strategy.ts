import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from './dto/jwt-payload.dto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/** Cache corto del estado de auth para no consultar la BD en cada request. */
const AUTH_STATE_TTL_SECONDS = 60;
const authStateKey = (userId: string) => `user:auth-state:${userId}`;

interface AuthState {
  is_active: boolean;
  role: string;
  org_id: string;
}

/**
 * Estrategia JWT de Passport.
 * Extrae el token del header Authorization: Bearer <token>.
 *
 * Fix seguridad M1: además de validar la firma/expiración, confirma contra la
 * BD (con cache de 60s en Redis) que el usuario sigue activo y toma el rol/org
 * ACTUALES, no los que llevaba el token. Así, desactivar un usuario o revertir
 * una escalada de rol surte efecto en ≤60s aunque el JWT siga vigente.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (!payload.sub) throw new UnauthorizedException();

    const state = await this.loadAuthState(payload.sub);
    if (!state || !state.is_active) {
      throw new UnauthorizedException('La sesión ya no es válida.');
    }

    // Usar el rol/org ACTUALES de la BD (no los del token) para autorización.
    return { ...payload, role: state.role, orgId: state.org_id };
  }

  private async loadAuthState(userId: string): Promise<AuthState | null> {
    const cached = await this.redis.get(authStateKey(userId));
    if (cached) {
      try {
        return JSON.parse(cached) as AuthState;
      } catch {
        /* cache corrupta → recargar de BD */
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { is_active: true, role: true, org_id: true },
    });

    if (!user) return null;

    const state: AuthState = {
      is_active: user.is_active,
      role: user.role,
      org_id: user.org_id,
    };
    await this.redis.set(
      authStateKey(userId),
      JSON.stringify(state),
      AUTH_STATE_TTL_SECONDS,
    );
    return state;
  }
}
