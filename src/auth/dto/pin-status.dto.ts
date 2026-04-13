import { IsNotEmpty, IsString } from 'class-validator';

export class PinStatusDto {
  @IsString()
  @IsNotEmpty()
  identification_number: string;
}
