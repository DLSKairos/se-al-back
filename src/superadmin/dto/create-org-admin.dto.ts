import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOrgAdminDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  identification_number: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  job_title?: string;
}
