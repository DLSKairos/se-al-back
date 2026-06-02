import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { InventariosController } from './inventarios.controller';
import { InventariosService } from './inventarios.service';
import { InventariosIaService } from './inventarios-ia.service';
import { FileStorageService } from './file-storage.service';

@Module({
  imports: [MulterModule.register({ storage: memoryStorage() })],
  controllers: [InventariosController],
  providers: [InventariosService, InventariosIaService, FileStorageService],
})
export class InventariosModule {}
