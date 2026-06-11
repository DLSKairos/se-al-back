import { IsEnum, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { MasterEntityType } from '@prisma/client';

export class CreateSuggestionDto {
  @IsEnum(MasterEntityType, {
    message: 'El tipo debe ser POSITION, ROLE o DEPARTMENT',
  })
  type: MasterEntityType;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name: string;
}
