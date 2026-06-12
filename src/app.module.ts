import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { DepartmentsModule } from './departments/departments.module';
import { UsersModule } from './users/users.module';
import { WorkLocationsModule } from './work-locations/work-locations.module';
import { AttendanceModule } from './attendance/attendance.module';
import { FormCategoriesModule } from './form-categories/form-categories.module';
import { FormTemplatesModule } from './form-templates/form-templates.module';
import { FormFieldsModule } from './form-fields/form-fields.module';
import { FormSubmissionsModule } from './form-submissions/form-submissions.module';
import { FormSignaturesModule } from './form-signatures/form-signatures.module';
import { FormNotificationsModule } from './form-notifications/form-notifications.module';
import { FormExportsModule } from './form-exports/form-exports.module';
import { PushNotificationsModule } from './push-notifications/push-notifications.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { FormBlueprintsModule } from './form-blueprints/form-blueprints.module';
import { FormAiModule } from './form-ai/form-ai.module';
import { InventariosModule } from './inventarios/inventarios.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MailModule } from './mail/mail.module';
import { MagicLinkModule } from './magic-link/magic-link.module';
import { AuthOAuthModule } from './auth-oauth/auth-oauth.module';
import { ElectronicSignatureModule } from './electronic-signature/electronic-signature.module';
import { FormApprovalModule } from './form-approval/form-approval.module';
import { SuperadminModule } from './superadmin/superadmin.module';
import { AdminManagementModule } from './admin-management/admin-management.module';
import { MasterListsModule } from './master-lists/master-lists.module';
import { StatusModule } from './status/status.module';

@Module({
  providers: [
    // S-02: ThrottlerGuard PRIMERO (rate limit antes de validar JWT para limitar
    // ataques de fuerza bruta sin consumir recursos de autenticación)
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Guards globales: JwtAuthGuard primero (autentica), RolesGuard segundo (autoriza)
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  imports: [
    // Configuración de variables de entorno disponible globalmente
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // S-02: Rate limiting global — 30 requests / 60s por IP
    // Los endpoints públicos sensibles sobrescriben este límite con @Throttle
    ThrottlerModule.forRoot([{ name: 'short', ttl: 60_000, limit: 30 }]),

    // Cron jobs
    ScheduleModule.forRoot(),

    // Infraestructura compartida
    PrismaModule,
    RedisModule,

    // Dominio
    AuthModule,
    OrganizationsModule,
    DepartmentsModule,
    UsersModule,
    WorkLocationsModule,
    AttendanceModule,
    FormCategoriesModule,
    FormTemplatesModule,
    FormFieldsModule,
    FormSubmissionsModule,
    FormSignaturesModule,
    FormNotificationsModule,
    FormExportsModule,
    FormBlueprintsModule,
    FormAiModule,
    InventariosModule,
    PushNotificationsModule,
    WebhooksModule,

    // Sprint: feature flags, notificaciones en-app, OAuth admins, magic link,
    // firma electrónica, aprobación automática, superadmin y listas maestras
    FeatureFlagsModule,
    NotificationsModule,
    MailModule,
    MagicLinkModule,
    AuthOAuthModule,
    ElectronicSignatureModule,
    FormApprovalModule,
    SuperadminModule,
    AdminManagementModule,
    MasterListsModule,
    StatusModule,
  ],
})
export class AppModule {}
