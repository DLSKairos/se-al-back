import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export enum BulkNotificationTarget {
  ALL = 'ALL',
  SITE = 'SITE',
  SPECIFIC = 'SPECIFIC',
}

/**
 * DTO para creación masiva de notificaciones por un admin.
 * Destinatarios determinados por `target`:
 *  - ALL      → todos los usuarios activos de la org
 *  - SITE     → todos los usuarios activos en una obra específica (work_location_id requerido)
 *  - SPECIFIC → lista explícita de user_ids (acotada a la org del admin)
 */
export class CreateBulkNotificationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  body: string;

  @IsEnum(BulkNotificationTarget)
  target: BulkNotificationTarget;

  @ValidateIf((o: CreateBulkNotificationDto) => o.target === BulkNotificationTarget.SITE)
  @IsString()
  @IsNotEmpty()
  work_location_id?: string;

  @ValidateIf((o: CreateBulkNotificationDto) => o.target === BulkNotificationTarget.SPECIFIC)
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  user_ids?: string[];

  @IsString()
  @IsOptional()
  deep_link?: string;
}
