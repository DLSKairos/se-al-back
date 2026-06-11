import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/dto/jwt-payload.dto';
import { MagicLinkService } from './magic-link.service';
import { GenerateFirstAdminLinkDto } from './dto/generate-first-admin-link.dto';
import { GenerateInviteLinkDto } from './dto/generate-invite-link.dto';

// ─── Rutas protegidas ─────────────────────────────────────────────────────────

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class MagicLinkController {
  constructor(private readonly magicLinkService: MagicLinkService) {}

  /**
   * SUPER_ADMIN genera el magic link de primer acceso para un admin cliente.
   * POST /superadmin/magic-link/first-admin
   */
  @Post('superadmin/magic-link/first-admin')
  @Roles('SUPER_ADMIN')
  async generateFirstAdmin(
    @Body() dto: GenerateFirstAdminLinkDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const result = await this.magicLinkService.generateFirstAdminLink(
      dto.userId,
      user.sub,
    );
    return {
      success: true,
      data: { tokenId: result.tokenId, link: result.link },
      message: 'Magic link generado y enviado por email.',
    };
  }

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
    return {
      success: true,
      data: { tokenId: result.tokenId, link: result.link },
      message: 'Invitación generada y enviada por email.',
    };
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
    return {
      success: true,
      data: { tokenId: result.tokenId, link: result.link },
      message: 'Nuevo magic link enviado.',
    };
  }

  /**
   * Historial de magic links por organización.
   * GET /superadmin/magic-link/history?orgId=xxx
   */
  @Get('superadmin/magic-link/history')
  @Roles('SUPER_ADMIN')
  async history(@Query('orgId') orgId: string) {
    const tokens = await this.magicLinkService.getHistoryByOrg(orgId);
    return { success: true, data: tokens };
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
   */
  @Public()
  @Get('magic-link')
  async validate(@Query('token') token: string) {
    if (!token) {
      return {
        success: false,
        data: { valid: false, error: 'TOKEN_NOT_FOUND' },
        message: 'Token no proporcionado.',
      };
    }

    const result = await this.magicLinkService.validate(token);
    return {
      success: result.valid,
      data: result,
      message: result.valid
        ? 'Token válido.'
        : 'Token inválido o expirado.',
    };
  }
}
