import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { FormAiService } from './form-ai.service';
import { GenerateFromDescriptionDto } from './dto/generate-from-description.dto';
import { AiAssistDto } from './dto/ai-assist.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

const ALLOWED_MIMETYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

@Controller('form-ai')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class FormAiController {
  constructor(private readonly formAiService: FormAiService) {}

  @Post('extract-from-file')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_, file, cb) => {
        cb(null, ALLOWED_MIMETYPES.includes(file.mimetype));
      },
    }),
  )
  extractFromFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      return {
        fields: [],
        source_filename: '',
        source_file_url: '',
        aiError: true,
        errorMessage: 'Archivo no recibido o formato no soportado.',
      };
    }
    console.log(`[FormAI] extract-from-file recibido: ${file.originalname} (${file.mimetype}, ${file.size} bytes)`);
    return this.formAiService.extractFromFile(file);
  }

  @Post('generate-from-description')
  @HttpCode(HttpStatus.OK)
  generateFromDescription(@Body() dto: GenerateFromDescriptionDto) {
    return this.formAiService.generateFromDescription(dto);
  }

  @Post('assist')
  @HttpCode(HttpStatus.OK)
  assist(@Body() dto: AiAssistDto) {
    return this.formAiService.assist(dto);
  }
}
