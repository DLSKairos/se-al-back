import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/dto/jwt-payload.dto';
import { MagicLinkService } from './magic-link.service';
import { GenerateInviteLinkDto } from './dto/generate-invite-link.dto';

// ─── Rutas protegidas ─────────────────────────────────────────────────────────
//
// NOTA: la generación del magic link de primer acceso vive en
// POST /superadmin/organizations/:id/first-admin-link (SuperadminController),
// que además valida que el usuario pertenece a la organización. La ruta
// duplicada POST /superadmin/magic-link/first-admin fue eliminada.
//
// Las respuestas se devuelven SIN envolver: el ResponseTransformInterceptor
// global agrega { success, data } — envolver aquí produciría doble envoltura.

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class MagicLinkController {
  constructor(private readonly magicLinkService: MagicLinkService) {}

  /**
   * ADMIN o SUPER_ADMIN invita a un nuevo administrador de su organización.
   * POST /admin/magic-link/invite
   */
  @Post('admin/magic-link/invite')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async generateInvite(
    @Body() dto: GenerateInviteLinkDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const result = await this.magicLinkService.generateAdminInviteLink(
      dto.userId,
      user.sub,
    );
    return { tokenId: result.tokenId, link: result.link };
  }

  /**
   * Reenvía (invalida el anterior y genera uno nuevo) el magic link.
   * POST /admin/magic-link/resend/:tokenId
   */
  @Post('admin/magic-link/resend/:tokenId')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async resend(
    @Param('tokenId') tokenId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const result = await this.magicLinkService.resendLink(tokenId, user.sub);
    return { tokenId: result.tokenId, link: result.link };
  }

  /**
   * Historial de magic links por organización.
   * GET /superadmin/magic-link/history?orgId=xxx
   */
  @Get('superadmin/magic-link/history')
  @Roles('SUPER_ADMIN')
  history(@Query('orgId') orgId: string) {
    return this.magicLinkService.getHistoryByOrg(orgId);
  }
}

// ─── Rutas públicas ────────────────────────────────────────────────────────────

@Controller('auth')
export class MagicLinkPublicController {
  constructor(private readonly magicLinkService: MagicLinkService) {}

  /**
   * Valida el magic link SIN consumirlo.
   * El frontend lo usa para mostrar la pantalla de activación (nombre + empresa)
   * antes de que el usuario complete el flujo OAuth.
   * GET /auth/magic-link?token=xxx
   *
   * S-02: throttle estricto (10/60s) — endpoint público que revela información
   * de existencia de tokens.
   */
  @Public()
  @Throttle({ short: { ttl: 60_000, limit: 10 } })
  @Get('magic-link')
  validate(@Query('token') token: string) {
    if (!token) {
      return { valid: false, error: 'TOKEN_NOT_FOUND' };
    }
    return this.magicLinkService.validate(token);
  }
}
