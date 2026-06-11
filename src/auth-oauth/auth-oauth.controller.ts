import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { AuthOAuthService } from './auth-oauth.service';

/**
 * Controlador OAuth.
 * Todos los endpoints son @Public (no requieren JWT previo).
 * El guard global JwtAuthGuard los salteará por la marca @Public.
 */
@Public()
@Controller('auth')
export class AuthOAuthController {
  constructor(private readonly oauthService: AuthOAuthService) {}

  // ─── Google ────────────────────────────────────────────────────────────────

  /**
   * Inicia el flujo OAuth con Google.
   * Query param opcional: magicToken (si viene de un magic link de activación).
   * GET /auth/google?magicToken=xxx
   */
  @Get('google')
  async googleLogin(
    @Query('magicToken') magicToken: string | undefined,
    @Res() res: Response,
  ) {
    let redirectUrl: string;
    try {
      redirectUrl = await this.oauthService.buildGoogleAuthUrl(magicToken);
    } catch (err) {
      if (err instanceof ServiceUnavailableException) {
        return res.status(503).json({
          success: false,
          message: (err as ServiceUnavailableException).message,
        });
      }
      throw err;
    }
    return res.redirect(redirectUrl);
  }

  /**
   * Callback de Google — recibe el código de autorización.
   * GET /auth/google/callback
   */
  @Get('google/callback')
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const callbackUrl = this.getCallbackUrl(req, '/auth/google/callback');
    const currentUrl = this.getCurrentUrl(req);

    const redirectTo = await this.oauthService.handleGoogleCallback(
      callbackUrl,
      currentUrl,
    );

    return res.redirect(redirectTo);
  }

  // ─── Microsoft ─────────────────────────────────────────────────────────────

  /**
   * Inicia el flujo OAuth con Microsoft.
   * GET /auth/microsoft?magicToken=xxx
   */
  @Get('microsoft')
  async microsoftLogin(
    @Query('magicToken') magicToken: string | undefined,
    @Res() res: Response,
  ) {
    let redirectUrl: string;
    try {
      redirectUrl = await this.oauthService.buildMicrosoftAuthUrl(magicToken);
    } catch (err) {
      if (err instanceof ServiceUnavailableException) {
        return res.status(503).json({
          success: false,
          message: (err as ServiceUnavailableException).message,
        });
      }
      throw err;
    }
    return res.redirect(redirectUrl);
  }

  /**
   * Callback de Microsoft — recibe el código de autorización.
   * GET /auth/microsoft/callback
   */
  @Get('microsoft/callback')
  async microsoftCallback(@Req() req: Request, @Res() res: Response) {
    const callbackUrl = this.getCallbackUrl(req, '/auth/microsoft/callback');
    const currentUrl = this.getCurrentUrl(req);

    const redirectTo = await this.oauthService.handleMicrosoftCallback(
      callbackUrl,
      currentUrl,
    );

    return res.redirect(redirectTo);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Reconstruye la URL del callback registrada en el proveedor OAuth.
   * Usa el host real del request para soportar tanto localhost como producción.
   */
  private getCallbackUrl(req: Request, path: string): string {
    const protocol = req.headers['x-forwarded-proto'] ?? req.protocol ?? 'https';
    const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost:3000';
    return `${protocol}://${host}${path}`;
  }

  /**
   * Reconstruye la URL completa del request actual (con query params).
   * openid-client necesita la URL completa para extraer el code y state.
   */
  private getCurrentUrl(req: Request): string {
    const protocol = req.headers['x-forwarded-proto'] ?? req.protocol ?? 'https';
    const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost:3000';
    return `${protocol}://${host}${req.originalUrl}`;
  }
}
