import {
  IsEnum,
  IsHexColor,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PlanTier } from '@prisma/client';

export class UpdateOrgConfigDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  display_name?: string;

  @IsOptional()
  @IsEnum(PlanTier)
  plan?: PlanTier;

  @IsOptional()
  @IsInt()
  @IsPositive()
  max_users?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  max_sites?: number;

  @IsOptional()
  @IsUrl()
  logo_url?: string;

  @IsOptional()
  @IsHexColor()
  primary_color?: string;
}
