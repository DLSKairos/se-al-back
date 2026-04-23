import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { FormAiController } from './form-ai.controller';
import { FormAiService } from './form-ai.service';
import { FileStorageService } from './file-storage.service';

@Module({
  imports: [MulterModule.register({ storage: memoryStorage() })],
  controllers: [FormAiController],
  providers: [FormAiService, FileStorageService],
})
export class FormAiModule {}
