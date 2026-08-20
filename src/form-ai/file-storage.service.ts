import { Injectable } from '@nestjs/common';
import {
  CloudinaryFileStorageService,
  CloudinaryResourceType,
} from '../common/services/cloudinary-file-storage.service';

/**
 * Gestiona subidas de archivos de formularios a Cloudinary.
 */
@Injectable()
export class FileStorageService extends CloudinaryFileStorageService {
  protected readonly folder = 'senal/forms';
  protected readonly resourceType: CloudinaryResourceType = 'raw';
}
