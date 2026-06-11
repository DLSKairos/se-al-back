import { NotificationType } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';

/**
 * Input para crear una notificación individual.
 * Usado internamente por otros módulos vía NotificationsService.create().
 */
export class CreateNotificationInput {
  @IsString()
  @IsNotEmpty()
  user_id: string;

  @IsEnum(NotificationType)
  type: NotificationType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  body: string;

  @IsString()
  @IsOptional()
  deep_link?: string;

  @IsString()
  @IsOptional()
  created_by_admin_id?: string;
}
