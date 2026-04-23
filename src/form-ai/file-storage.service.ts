import { Injectable } from '@nestjs/common';
import { cloudinary } from './cloudinary.config';

@Injectable()
export class FileStorageService {
  async upload(buffer: Buffer, originalname: string, mimetype: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'senal/forms',
          resource_type: 'raw',
          public_id: `${Date.now()}-${originalname.replace(/\s+/g, '_')}`,
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
