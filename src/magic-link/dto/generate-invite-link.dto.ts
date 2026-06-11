import { IsString, IsNotEmpty } from 'class-validator';

export class GenerateInviteLinkDto {
  @IsString()
  @IsNotEmpty()
  userId: string;
}
