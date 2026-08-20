import { Injectable } from '@nestjs/common';
import {
  CloudinaryFileStorageService,
  CloudinaryResourceType,
} from '../common/services/cloudinary-file-storage.service';

/**
 * Gestiona subidas de archivos de inventario a Cloudinary.
 */
@Injectable()
export class FileStorageService extends CloudinaryFileStorageService {
  protected readonly folder = 'senal/inventarios';
  protected readonly resourceType: CloudinaryResourceType = 'auto';
}
