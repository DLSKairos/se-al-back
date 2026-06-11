import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

/**
 * Gestiona subidas de archivos a Cloudinary.
 * Usa ConfigService.getOrThrow para fallar al arrancar si falta config (Fix #23).
 */
@Injectable()
export class FileStorageService implements OnModuleInit {
  private readonly logger = new Logger(FileStorageService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    cloudinary.config({
      cloud_name: this.config.getOrThrow<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.config.getOrThrow<string>('CLOUDINARY_API_KEY'),
      api_secret: this.config.getOrThrow<string>('CLOUDINARY_API_SECRET'),
    });
  }

  async upload(buffer: Buffer, _originalname: string, mimetype: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'senal/forms',
          resource_type: 'raw',
          public_id: `${Date.now()}`,
          use_filename: false,
        },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error('Upload falló'));
          resolve(result.secure_url);
        },
      );
      void mimetype; // Evitar lint: mimetype se puede usar para content_type si se requiere
      uploadStream.end(buffer);
    });
  }
}
