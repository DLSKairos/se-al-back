import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtPayload } from '../auth/dto/jwt-payload.dto';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { ElectronicSignatureService } from './electronic-signature.service';
import { CreateExternalSignerDto } from './dto/create-external-signer.dto';
import { CreateSignatureTokenDto } from './dto/create-signature-token.dto';
import { MarkLinkSentDto } from './dto/mark-link-sent.dto';
import { SignInternalDto } from './dto/sign-internal.dto';
import { UpdateSignatureConfigDto } from './dto/update-signature-config.dto';

/**
 * Controlador de firma electrónica — endpoints autenticados.
 *
 * Prefijo base: /signatures
 *
 * Todos los endpoints requieren JWT válido (JwtAuthGuard global).
 * Los que requieren rol específico tienen @Roles declarado.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('signatures')
export class ElectronicSignatureController {
  constructor(
    private readonly signatureService: ElectronicSignatureService,
    private readonly featureFlags: FeatureFlagsService,
  ) {}

  // ── GUARD de feature flag ────────────────────────────────────────────────
  private async assertFeatureEnabled(): Promise<void> {
    const enabled = await this.featureFlags.isEnabled('electronic_signature');
    if (!enabled) {
      throw new ForbiddenException(
        'La funcionalidad de firma electrónica no está habilitada en esta organización',
      );
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CATÁLOGO DE FIRMANTES EXTERNOS
  // GET    /signatures/external-signers?workLocationId=xxx
  // POST   /signatures/external-signers
  // ════════════════════════════════════════════════════════════════════════════

  @Get('external-signers')
  async listExternalSigners(
    @CurrentUser() user: JwtPayload,
    @Query('workLocationId') workLocationId: string,
  ) {
    await this.assertFeatureEnabled();
    return this.signatureService.listExternalSigners(user.orgId, workLocationId);
  }

  @Post('external-signers')
  @HttpCode(HttpStatus.CREATED)
  async createExternalSigner(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateExternalSignerDto,
  ) {
    await this.assertFeatureEnabled();
    return this.signatureService.createExternalSigner(user.orgId, dto);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TOKENS DE FIRMA
  // POST   /signatures/tokens
  // POST   /signatures/tokens/mark-sent
  // GET    /signatures/submissions/:submissionId/status
  // ════════════════════════════════════════════════════════════════════════════

  @Post('tokens')
  @HttpCode(HttpStatus.CREATED)
  async createSignatureToken(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSignatureTokenDto,
  ) {
    await this.assertFeatureEnabled();
    return this.signatureService.createSignatureToken(user.orgId, dto);
  }

  /**
   * El frontend invoca este endpoint cuando el operario regresa a la app
   * después de haber abierto WhatsApp con el link.
   */
  @Post('tokens/mark-sent')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markLinkSent(
    @CurrentUser() user: JwtPayload,
    @Body() dto: MarkLinkSentDto,
  ) {
    await this.assertFeatureEnabled();
    await this.signatureService.markLinkSent(dto.signature_token_id, user.orgId);
  }

  @Get('submissions/:submissionId/status')
  async getStatus(
    @CurrentUser() user: JwtPayload,
    @Param('submissionId') submissionId: string,
  ) {
    await this.assertFeatureEnabled();
    return this.signatureService.getSubmissionSignatureStatus(
      submissionId,
      user.orgId,
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FIRMA INTERNA
  // POST   /signatures/submissions/:submissionId/sign
  // ════════════════════════════════════════════════════════════════════════════

  @Post('submissions/:submissionId/sign')
  @HttpCode(HttpStatus.CREATED)
  async signInternal(
    @CurrentUser() user: JwtPayload,
    @Param('submissionId') submissionId: string,
    @Body() dto: SignInternalDto,
    @Req() req: Request,
  ) {
    await this.assertFeatureEnabled();

    const ipAddress = this.extractIp(req);
    const userAgent = req.headers['user-agent'] ?? 'desconocido';

    return this.signatureService.signInternal(
      submissionId,
      user.sub,
      user.orgId,
      dto,
      ipAddress,
      userAgent,
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // VERIFICACIÓN DE INTEGRIDAD
  // GET    /signatures/submissions/:submissionId/verify
  // ════════════════════════════════════════════════════════════════════════════

  @Get('submissions/:submissionId/verify')
  async verifyIntegrity(
    @CurrentUser() user: JwtPayload,
    @Param('submissionId') submissionId: string,
  ) {
    await this.assertFeatureEnabled();
    return this.signatureService.verifyDocumentIntegrity(submissionId, user.orgId);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // IDENTIDAD DE FIRMANTE EXTERNO (URLS FIRMADAS — SOLO ADMIN)
  // GET    /signatures/external-signers/:id/identity-urls
  // ════════════════════════════════════════════════════════════════════════════

  @Get('external-signers/:id/identity-urls')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async getIdentityUrls(
    @CurrentUser() user: JwtPayload,
    @Param('id') signerId: string,
  ) {
    await this.assertFeatureEnabled();
    return this.signatureService.getExternalSignerIdentityUrls(signerId, user.orgId);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CONFIGURACIÓN DE FIRMA POR TEMPLATE (SOLO ADMIN)
  // GET    /signatures/templates/:templateId/config
  // PUT    /signatures/templates/:templateId/config
  // ════════════════════════════════════════════════════════════════════════════

  @Get('templates/:templateId/config')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async getConfig(
    @CurrentUser() user: JwtPayload,
    @Param('templateId') templateId: string,
  ) {
    return this.signatureService.getSignatureConfig(templateId, user.orgId);
  }

  @Put('templates/:templateId/config')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async updateConfig(
    @CurrentUser() user: JwtPayload,
    @Param('templateId') templateId: string,
    @Body() dto: UpdateSignatureConfigDto,
  ) {
    return this.signatureService.upsertSignatureConfig(templateId, user.orgId, dto);
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  /** Extrae IP real considerando proxies (X-Forwarded-For) */
  private extractIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.socket?.remoteAddress ?? 'desconocida';
  }
}
