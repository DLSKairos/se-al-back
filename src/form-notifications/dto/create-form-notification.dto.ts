import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationTrigger } from '@prisma/client';

export class NotificationRecipientDto {
  @IsEnum(['role', 'email', 'department'])
  type: 'role' | 'email' | 'department';

  @IsString()
  @IsNotEmpty()
  value: string;
}

export class CreateFormNotificationDto {
  @IsString()
  @IsNotEmpty()
  template_id: string;

  @IsEnum(NotificationTrigger)
  trigger: NotificationTrigger;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationRecipientDto)
  recipients: NotificationRecipientDto[];

  @IsArray()
  @IsString({ each: true })
  channels: string[];

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
