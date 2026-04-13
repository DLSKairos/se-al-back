import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FieldType, Frequency } from '@prisma/client';

class FieldOptionItem {
  @IsString()
  label: string;

  @IsString()
  value: string;
}

export class CreateFormFieldDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  label: string;

  @IsString()
  @IsOptional()
  key?: string;

  @IsEnum(FieldType)
  type: FieldType;

  @IsBoolean()
  @IsOptional()
  required?: boolean;

  @IsString()
  @IsOptional()
  default_value?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldOptionItem)
  @IsOptional()
  options?: FieldOptionItem[];

  @IsObject()
  @IsOptional()
  validations?: Record<string, unknown>;

  @IsEnum(Frequency)
  @IsOptional()
  revalidation_frequency?: Frequency;

  @IsInt()
  @Min(0)
  @IsOptional()
  order?: number;
}
