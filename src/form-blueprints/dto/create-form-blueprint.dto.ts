import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateFormBlueprintDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  category: string;

  @IsArray()
  fields: any[];
}
