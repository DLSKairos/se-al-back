import {
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateSubmissionDto {
  @IsString()
  @IsNotEmpty()
  template_id: string;

  @IsString()
  @IsOptional()
  work_location_id?: string;

  @IsObject()
  values: Record<string, unknown>;

  @IsNumber()
  @IsOptional()
  geo_lat?: number;

  @IsNumber()
  @IsOptional()
  geo_lng?: number;
}
