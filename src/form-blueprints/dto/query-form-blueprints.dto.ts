import { IsOptional, IsString } from 'class-validator';

export class QueryFormBlueprintsDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
