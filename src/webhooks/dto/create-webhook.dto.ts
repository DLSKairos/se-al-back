import { IsArray, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateWebhookDto {
  @IsUrl()
  url: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  event_types?: string[];
}
