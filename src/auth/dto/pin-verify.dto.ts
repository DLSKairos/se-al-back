import { IsNotEmpty, IsString } from 'class-validator';

export class PinVerifyDto {
  @IsString()
  @IsNotEmpty()
  identification_number: string;

  @IsString()
  @IsNotEmpty()
  pin: string;
}
