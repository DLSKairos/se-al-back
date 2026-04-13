import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

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

@Module({
  imports: [
    // Configuración de variables de entorno disponible globalmente
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

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
    PushNotificationsModule,
    WebhooksModule,
  ],
})
export class AppModule {}
