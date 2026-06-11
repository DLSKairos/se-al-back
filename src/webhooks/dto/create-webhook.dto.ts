import { IsArray, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateWebhookDto {
  /**
   * Solo se permiten URLs HTTPS con TLD válido.
   * La validación de hostnames privados se realiza en el service (Fix #13).
   */
  @IsUrl({ protocols: ['https'], require_tld: true })
  url: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  event_types?: string[];
}
