import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuthProvider, UserRole } from '@prisma/client';
import type * as openidClient from 'openid-client';
import type { TokenEndpointResponseHelpers } from 'openid-client';
import type { TokenEndpointResponse } from 'oauth4webapi';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { MagicLinkService } from '../magic-link/magic-link.service';
import { AuthService } from '../auth/auth.service';
import { encrypt, randomHex } from './crypto.util';

const STATE_TTL_SECONDS = 600; // 10 minutos

// openid-client v6 es ESM-only y este proyecto compila a CommonJS: se carga
// con import() dinámico real. La indirección con Function evita que tsc lo
// transpile a require(), lo que rompería en runtime (ERR_REQUIRE_ESM).
const loadOpenIdClient = new Function(
  "return import('openid-client')",
) as () => Promise<typeof import('openid-client')>;

interface OAuthStatePayload {
  provider: 'google' | 'microsoft';
  magicToken?: string;
  codeVerifier: string;
}

interface DiscoveredConfig {
  google?: openidClient.Configuration;
  microsoft?: openidClient.Configuration;
}

/**
 * Servicio OAuth 2.0 / OIDC con PKCE para administradores de SEÑAL.
 * Implementación manual usando openid-client v6 para tener control total
 * sobre el code_verifier/challenge y el state anti-CSRF.
 *
 * Los clientes OIDC se inicializan de forma lazy al primer uso para evitar
 * crashear el boot si las credenciales no están configuradas.
 */
@Injectable()
export class AuthOAuthService {
  private readonly logger = new Logger(AuthOAuthService.name);
  private readonly discovered: DiscoveredConfig = {};
  private oidcModule?: typeof import('openid-client');

  /** Carga lazy del módulo ESM openid-client (ver loadOpenIdClient arriba). */
  private async oidc(): Promise<typeof import('openid-client')> {
    if (!this.oidcModule) {
      this.oidcModule = await loadOpenIdClient();
    }
    return this.oidcModule;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly featureFlags: FeatureFlagsService,
    private readonly magicLinkService: MagicLinkService,
    private readonly authService: AuthService,
  ) {}

  // ─── Flags y credenciales ────────────────────────────────────────────────────

  private async checkGoogleFlag(): Promise<void> {
    if (!(await this.featureFlags.isEnabled('oauth_google'))) {
      throw new ForbiddenException(
        'El inicio de sesión con Google no está habilitado en este momento.',
      );
    }
  }

  private async checkMicrosoftFlag(): Promise<void> {
    if (!(await this.featureFlags.isEnabled('oauth_microsoft'))) {
      throw new ForbiddenException(
        'El inicio de sesión con Microsoft no está habilitado en este momento.',
      );
    }
  }

  private getEncryptionKey(): string {
    const key = this.config.get<string>('ENCRYPTION_KEY');
    if (!key || key.length !== 64) {
      throw new Error(
        'ENCRYPTION_KEY debe ser exactamente 32 bytes en hex (64 caracteres).',
      );
    }
    return key;
  }

  // ─── Discovery OIDC (lazy) ───────────────────────────────────────────────────

  private async getGoogleConfig(): Promise<openidClient.Configuration> {
    if (this.discovered.google) return this.discovered.google;

    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException(
        'Proveedor no configurado: faltan GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET en el .env.',
      );
    }

    this.discovered.google = await (await this.oidc()).discovery(
      new URL('https://accounts.google.com'),
      clientId,
      clientSecret,
    );
    return this.discovered.google;
  }

  private async getMicrosoftConfig(): Promise<openidClient.Configuration> {
    if (this.discovered.microsoft) return this.discovered.microsoft;

    const clientId = this.config.get<string>('MICROSOFT_CLIENT_ID');
    const clientSecret = this.config.get<string>('MICROSOFT_CLIENT_SECRET');
    const tenantId = this.config.get<string>('MICROSOFT_TENANT_ID', 'common');

    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException(
        'Proveedor no configurado: faltan MICROSOFT_CLIENT_ID o MICROSOFT_CLIENT_SECRET en el .env.',
      );
    }

    this.discovered.microsoft = await (await this.oidc()).discovery(
      new URL(`https://login.microsoftonline.com/${tenantId}/v2.0`),
      clientId,
      clientSecret,
    );
    return this.discovered.microsoft;
  }

  // ─── PKCE helpers ────────────────────────────────────────────────────────────

  private generateCodeVerifier(): string {
    // RFC 7636: 43-128 caracteres URL-safe
    return randomHex(32); // 64 chars hex — válido
  }

  private generateCodeChallenge(verifier: string): string {
    return createHash('sha256')
      .update(verifier)
      .digest('base64url');
  }

  // ─── Inicio del flujo (redirect URL) ────────────────────────────────────────

  async buildGoogleAuthUrl(magicToken?: string): Promise<string> {
    await this.checkGoogleFlag();
    const config = await this.getGoogleConfig();

    const state = randomHex(16);
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);

    const callbackUrl = this.config.getOrThrow<string>('GOOGLE_CALLBACK_URL');

    const payload: OAuthStatePayload = {
      provider: 'google',
      codeVerifier,
      ...(magicToken && { magicToken }),
    };

    await this.redis.set(
      `oauth:state:${state}`,
      JSON.stringify(payload),
      STATE_TTL_SECONDS,
    );

    const url = (await this.oidc()).buildAuthorizationUrl(config, {
      redirect_uri: callbackUrl,
      scope: 'openid email profile',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    this.logger.log(`[OAuth/Google] Auth URL generada — state: ${state}`);
    return url.href;
  }

  async buildMicrosoftAuthUrl(magicToken?: string): Promise<string> {
    await this.checkMicrosoftFlag();
    const config = await this.getMicrosoftConfig();

    const state = randomHex(16);
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);

    const callbackUrl = this.config.getOrThrow<string>('MICROSOFT_CALLBACK_URL');

    const payload: OAuthStatePayload = {
      provider: 'microsoft',
      codeVerifier,
      ...(magicToken && { magicToken }),
    };

    await this.redis.set(
      `oauth:state:${state}`,
      JSON.stringify(payload),
      STATE_TTL_SECONDS,
    );

    const url = (await this.oidc()).buildAuthorizationUrl(config, {
      redirect_uri: callbackUrl,
      scope: 'openid email profile',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    this.logger.log(`[OAuth/Microsoft] Auth URL generada — state: ${state}`);
    return url.href;
  }

  // ─── Callback de Google ──────────────────────────────────────────────────────

  async handleGoogleCallback(
    callbackUrl: string,
    currentUrl: string,
  ): Promise<string> {
    await this.checkGoogleFlag();

    const params = new URL(currentUrl).searchParams;
    const state = params.get('state');

    if (!state) {
      throw new UnauthorizedException('Parámetro state ausente en el callback.');
    }

    const { payload, config } = await this.consumeState(state, 'google');
    const googleConfig = await this.getGoogleConfig();

    let tokens: TokenEndpointResponse & TokenEndpointResponseHelpers;
    try {
      tokens = await (await this.oidc()).authorizationCodeGrant(
        googleConfig,
        new URL(currentUrl),
        {
          pkceCodeVerifier: payload.codeVerifier,
          expectedState: state,
        },
      );
    } catch (err) {
      this.logger.error(`[OAuth/Google] Error intercambiando código: ${String(err)}`);
      throw new UnauthorizedException('Error al completar la autenticación con Google.');
    }

    const claims = tokens.claims();
    const email = typeof claims?.email === 'string' ? claims.email : null;
    const providerId = typeof claims?.sub === 'string' ? claims.sub : null;
    const accessToken = tokens.access_token ?? null;
    const refreshToken = tokens.refresh_token ?? null;

    if (!email || !providerId) {
      throw new UnauthorizedException('No se pudo obtener el email verificado de Google.');
    }

    this.logger.log(`[OAuth/Google] Callback exitoso — email: ${email}`);

    return this.completeOAuthFlow({
      email,
      providerId,
      provider: OAuthProvider.GOOGLE,
      accessToken,
      refreshToken,
      magicToken: payload.magicToken,
    });
  }

  // ─── Callback de Microsoft ───────────────────────────────────────────────────

  async handleMicrosoftCallback(
    callbackUrl: string,
    currentUrl: string,
  ): Promise<string> {
    await this.checkMicrosoftFlag();

    const params = new URL(currentUrl).searchParams;
    const state = params.get('state');

    if (!state) {
      throw new UnauthorizedException('Parámetro state ausente en el callback.');
    }

    const { payload } = await this.consumeState(state, 'microsoft');
    const msConfig = await this.getMicrosoftConfig();

    let tokens: TokenEndpointResponse & TokenEndpointResponseHelpers;
    try {
      tokens = await (await this.oidc()).authorizationCodeGrant(
        msConfig,
        new URL(currentUrl),
        {
          pkceCodeVerifier: payload.codeVerifier,
          expectedState: state,
        },
      );
    } catch (err) {
      this.logger.error(`[OAuth/Microsoft] Error intercambiando código: ${String(err)}`);
      throw new UnauthorizedException('Error al completar la autenticación con Microsoft.');
    }

    const claims = tokens.claims();
    const email = typeof claims?.email === 'string'
      ? claims.email
      : typeof claims?.preferred_username === 'string'
        ? claims.preferred_username
        : null;
    const providerId = typeof claims?.sub === 'string' ? claims.sub : null;
    const accessToken = tokens.access_token ?? null;
    const refreshToken = tokens.refresh_token ?? null;

    if (!email || !providerId) {
      throw new UnauthorizedException(
        'No se pudo obtener el email verificado de Microsoft.',
      );
    }

    this.logger.log(`[OAuth/Microsoft] Callback exitoso — email: ${email}`);

    return this.completeOAuthFlow({
      email,
      providerId,
      provider: OAuthProvider.MICROSOFT,
      accessToken,
      refreshToken,
      magicToken: payload.magicToken,
    });
  }

  // ─── Flujo común post-callback ───────────────────────────────────────────────

  private async completeOAuthFlow(params: {
    email: string;
    providerId: string;
    provider: OAuthProvider;
    accessToken: string | null;
    refreshToken: string | null;
    magicToken?: string;
  }): Promise<string> {
    const { email, providerId, provider, accessToken, refreshToken, magicToken } = params;
    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:4000');
    const encKey = this.getEncryptionKey();

    // ── FLUJO DE ACTIVACIÓN (viene desde magic link) ─────────────────────────
    if (magicToken) {
      let magicLinkData: Awaited<ReturnType<MagicLinkService['validateAndConsume']>>;
      try {
        magicLinkData = await this.magicLinkService.validateAndConsume(magicToken);
      } catch {
        this.logger.warn(`[OAuth] Magic link inválido durante activación — token: ${magicToken}`);
        return `${frontendUrl}/login?error=magic_link_invalid`;
      }

      const targetUser = await this.prisma.user.findUnique({
        where: { id: magicLinkData.userId },
      });

      if (!targetUser || targetUser.role !== UserRole.ADMIN) {
        this.logger.warn(
          `[OAuth] Activación rechazada — usuario no es ADMIN: ${magicLinkData.userId}`,
        );
        return `${frontendUrl}/login?error=not_registered`;
      }

      // Vincular OAuth al usuario
      await this.prisma.user.update({
        where: { id: targetUser.id },
        data: {
          email: targetUser.email ?? email,
          oauth_provider: provider,
          oauth_provider_id: providerId,
          oauth_access_token: accessToken ? encrypt(accessToken, encKey) : null,
          oauth_refresh_token: refreshToken ? encrypt(refreshToken, encKey) : null,
          last_oauth_sync: new Date(),
          is_active: true,
        },
      });

      this.logger.log(
        `[OAuth] Cuenta activada y vinculada — userId: ${targetUser.id}, ` +
          `provider: ${provider}, email: ${email}`,
      );

      const jwt = await this.authService.generateJwt({
        ...targetUser,
        email: targetUser.email ?? email,
        oauth_provider: provider,
        oauth_provider_id: providerId,
        last_oauth_sync: new Date(),
      });

      return `${frontendUrl}/auth/callback?token=${jwt}&activated=1`;
    }

    // ── FLUJO LOGIN (sin magic token) ─────────────────────────────────────────
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (
      !user ||
      (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) ||
      !user.is_active
    ) {
      this.logger.warn(
        `[OAuth] Login rechazado — email: ${email}, user: ${user?.id ?? 'no encontrado'}`,
      );
      return `${frontendUrl}/login?error=not_registered`;
    }

    // Para login normal el oauth_provider ya debe estar vinculado
    if (!user.oauth_provider) {
      this.logger.warn(
        `[OAuth] Login rechazado — cuenta sin vincular — userId: ${user.id}`,
      );
      return `${frontendUrl}/login?error=not_registered`;
    }

    // Actualizar tokens y sync
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        oauth_provider_id: providerId,
        oauth_access_token: accessToken ? encrypt(accessToken, encKey) : null,
        oauth_refresh_token: refreshToken ? encrypt(refreshToken, encKey) : null,
        last_oauth_sync: new Date(),
      },
    });

    this.logger.log(
      `[OAuth] Login exitoso — userId: ${user.id}, provider: ${provider}`,
    );

    const jwt = await this.authService.generateJwt({
      ...user,
      oauth_provider_id: providerId,
      last_oauth_sync: new Date(),
    });

    return `${frontendUrl}/auth/callback?token=${jwt}`;
  }

  // ─── Redis: consumir state (single-use, anti-CSRF) ───────────────────────────

  private async consumeState(
    state: string,
    expectedProvider: 'google' | 'microsoft',
  ): Promise<{ payload: OAuthStatePayload; config: null }> {
    const key = `oauth:state:${state}`;
    const raw = await this.redis.get(key);

    if (!raw) {
      throw new UnauthorizedException(
        'Estado OAuth inválido o expirado. Inicia el proceso de nuevo.',
      );
    }

    // Eliminar inmediatamente (single-use)
    await this.redis.del(key);

    let payload: OAuthStatePayload;
    try {
      payload = JSON.parse(raw) as OAuthStatePayload;
    } catch {
      throw new UnauthorizedException('Estado OAuth con formato inválido.');
    }

    if (payload.provider !== expectedProvider) {
      throw new UnauthorizedException(
        `Proveedor en el state (${payload.provider}) no coincide con el callback (${expectedProvider}).`,
      );
    }

    return { payload, config: null };
  }
}
