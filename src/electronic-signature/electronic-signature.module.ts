import { Module } from '@nestjs/common';
import { ElectronicSignatureService } from './electronic-signature.service';
import { ElectronicSignatureController } from './electronic-signature.controller';
import { PublicSignatureController } from './public-signature.controller';
import { SignatureFileStorageService } from './signature-file-storage.service';
import { FormApprovalModule } from '../form-approval/form-approval.module';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * Módulo de firma electrónica legalmente válida (Ley 527/1999, Decreto 2364/2012).
 *
 * Registrar en AppModule.imports para activar.
 *
 * Dependencias globales ya disponibles (sin importar aquí):
 * - PrismaModule (@Global)  → PrismaService
 * - RedisModule (@Global)   → RedisService
 * - FeatureFlagsModule (@Global) → FeatureFlagsService
 *
 * Endpoints expuestos:
 * — Autenticados (prefijo /signatures):
 *   GET    /signatures/external-signers?workLocationId=xxx
 *   POST   /signatures/external-signers
 *   POST   /signatures/tokens
 *   POST   /signatures/tokens/mark-sent
 *   GET    /signatures/submissions/:submissionId/status
 *   POST   /signatures/submissions/:submissionId/sign
 *   GET    /signatures/submissions/:submissionId/verify
 *   GET    /signatures/external-signers/:id/identity-urls  [@Roles ADMIN]
 *   GET    /signatures/templates/:templateId/config         [@Roles ADMIN]
 *   PUT    /signatures/templates/:templateId/config         [@Roles ADMIN]
 *
 * — Públicos (prefijo /public/signature):
 *   GET    /public/signature/:token
 *   POST   /public/signature/:token/identity  (multipart)
 *   POST   /public/signature/:token/sign
 *
 * Integración con otros módulos:
 * - FormApprovalModule: tras cada firma exitosa se invoca checkAutoApproval.
 * - NotificationsModule: se notifica al dueño del submission cuando alguien firma.
 */
@Module({
  imports: [FormApprovalModule, NotificationsModule],
  controllers: [
    ElectronicSignatureController,
    PublicSignatureController,
  ],
  providers: [
    ElectronicSignatureService,
    SignatureFileStorageService,
  ],
  exports: [
    ElectronicSignatureService,
  ],
})
export class ElectronicSignatureModule {}
