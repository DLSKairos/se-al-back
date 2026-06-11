/**
 * cloudinary.config.ts — NO configurar Cloudinary aquí con process.env.
 * La configuración se realiza en FileStorageService vía ConfigService.
 */
export { v2 as cloudinary } from 'cloudinary';

