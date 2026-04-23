import { IsBoolean, IsIn, IsString, MinLength } from 'class-validator';

export class GenerateFromDescriptionDto {
  @IsString()
  @MinLength(10)
  description: string;

  @IsIn([1, 2, 3])
  columns: 1 | 2 | 3;

  @IsBoolean()
  observationsPerSection: boolean;
}
