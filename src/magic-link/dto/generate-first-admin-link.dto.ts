import { IsString, IsNotEmpty } from 'class-validator';

export class GenerateFirstAdminLinkDto {
  @IsString()
  @IsNotEmpty()
  userId: string;
}
