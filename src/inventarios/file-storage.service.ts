import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

/**
 * Gestiona subidas de archivos de inventario a Cloudinary.
 * Usa ConfigService.getOrThrow para fallar al arrancar si falta config (Fix #23).
 */
@Injectable()
export class FileStorageService implements OnModuleInit {
  constructor(private readonly config: ConfigService) {}

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
          folder: 'senal/inventarios',
          resource_type: 'auto',
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
