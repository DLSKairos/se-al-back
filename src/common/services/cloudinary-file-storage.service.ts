import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

export type CloudinaryResourceType = 'raw' | 'auto';

/**
 * Base compartida para servicios de subida de archivos públicos a Cloudinary.
 * Las subclases fijan `folder` y `resourceType` según su dominio (forms, inventarios, etc).
 * Usa ConfigService.getOrThrow para fallar al arrancar si falta config (Fix #23).
 *
 * NOTA: para assets privados/autenticados usar SignatureFileStorageService
 * (src/electronic-signature/signature-file-storage.service.ts), no esta clase.
 */
export abstract class CloudinaryFileStorageService implements OnModuleInit {
  protected abstract readonly folder: string;
  protected abstract readonly resourceType: CloudinaryResourceType;

  constructor(protected readonly config: ConfigService) {}

  onModuleInit() {
    cloudinary.config({
      cloud_name: this.config.getOrThrow<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.config.getOrThrow<string>('CLOUDINARY_API_KEY'),
      api_secret: this.config.getOrThrow<string>('CLOUDINARY_API_SECRET'),
    });
  }

  async upload(buffer: Buffer, _originalname: string, _mimetype: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: this.folder,
          resource_type: this.resourceType,
          public_id: `${Date.now()}`,
          use_filename: false,
        },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error('Upload falló'));
          resolve(result.secure_url);
        },
      );
      uploadStream.end(buffer);
    });
  }
}
