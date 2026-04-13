import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationRecipientDto } from './create-form-notification.dto';

export class UpdateFormNotificationDto {
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => NotificationRecipientDto)
  recipients?: NotificationRecipientDto[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  channels?: string[];

  @IsString()
  @IsOptional()
  subject?: string;

  @IsString()
  @IsOptional()
  body?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}
