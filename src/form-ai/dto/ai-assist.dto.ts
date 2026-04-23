import { IsArray, IsString, MinLength } from 'class-validator';

export class AiAssistDto {
  @IsString()
  @MinLength(1)
  message: string;

  @IsArray()
  currentSections: any[];
}
