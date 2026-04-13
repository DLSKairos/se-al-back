import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOrganizationDto {
  @IsString()
  @IsOptional()
  @MaxLength(150)
  name?: string;
}
