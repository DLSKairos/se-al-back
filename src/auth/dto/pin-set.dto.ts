import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class PinSetDto {
  @IsString()
  @IsNotEmpty()
  identification_number: string;

  @IsString()
  @Matches(/^\d{4,8}$/, { message: 'El PIN debe ser numérico de 4 a 8 dígitos' })
  pin: string;
}
