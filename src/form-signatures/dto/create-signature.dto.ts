import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSignatureDto {
  @IsString()
  @IsNotEmpty()
  signer_name: string;

  @IsString()
  @IsOptional()
  signer_role?: string;

  @IsString()
  @IsOptional()
  signer_doc?: string;

  /**
   * URL pública de la imagen de firma (subida previamente al storage)
   * o cadena base64 que el service convertirá a URL.
   */
  @IsString()
  @IsNotEmpty()
  signature_url: string;
}
