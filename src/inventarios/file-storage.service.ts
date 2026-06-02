import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

@Injectable()
export class FileStorageService {
  async upload(buffer: Buffer, originalname: string, mimetype: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'senal/inventarios',
          resource_type: 'auto',
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
