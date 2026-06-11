import { Injectable, InternalServerErrorException, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

/**
 * Servicio de almacenamiento privado de Cloudinary para el módulo de firma electrónica.
 *
 * IMPORTANTE: A diferencia del FileStorageService de inventarios (acceso público),
 * este servicio usa delivery_type 'authenticated' — los assets NUNCA tienen URL pública.
 * El acceso se realiza SIEMPRE por URLs firmadas con expiración corta.
 *
 * Carpetas:
 * - señal/firmas/{org_id}/cedulas/  — fotos de cédula de firmantes externos
 * - señal/firmas/{org_id}/selfies/  — selfies de firmantes externos
 */
@Injectable()
export class SignatureFileStorageService implements OnModuleInit {
  private readonly logger = new Logger(SignatureFileStorageService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    cloudinary.config({
      cloud_name: this.config.getOrThrow<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.config.getOrThrow<string>('CLOUDINARY_API_KEY'),
      api_secret: this.config.getOrThrow<string>('CLOUDINARY_API_SECRET'),
    });
  }

  /**
   * Sube una imagen a Cloudinary como asset autenticado (privado).
   *
   * @param buffer  Buffer de la imagen
   * @param orgId   ID de la organización (para carpeta multi-tenant)
   * @param folder  'cedulas' | 'selfies'
   * @returns public_id del asset en Cloudinary (se almacena en BD, no la URL)
   */
  async uploadPrivate(
    buffer: Buffer,
    orgId: string,
    folder: 'cedulas' | 'selfies',
  ): Promise<string> {
    const cloudFolder = `senal/firmas/${orgId}/${folder}`;
    const publicId = `${cloudFolder}/${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          resource_type: 'image',
          type: 'authenticated',
          use_filename: false,
          overwrite: false,
        },
        (error, result) => {
          if (error || !result) {
            this.logger.error(`Error subiendo a Cloudinary: ${String(error?.message ?? 'sin resultado')}`);
            return reject(
              new InternalServerErrorException('Error al almacenar imagen de identidad'),
            );
          }
          resolve(result.public_id);
        },
      );
      stream.end(buffer);
    });
  }

  /**
   * Genera una URL firmada con expiración para un asset privado.
   * Usar SOLO para auditorías autorizadas (admin/super_admin).
   *
   * @param publicId  public_id almacenado en BD
   * @param expiresInSeconds  tiempo de validez de la URL (default 600 = 10 minutos)
   * @returns URL firmada con expiración
   */
  generateSignedUrl(publicId: string, expiresInSeconds = 600): string {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
    return cloudinary.utils.private_download_url(publicId, 'jpg', {
      expires_at: expiresAt,
      attachment: false,
    });
  }
}
