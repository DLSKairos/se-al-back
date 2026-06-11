import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { ElectronicSignatureService } from './electronic-signature.service';
import { SignExternalDto } from './dto/sign-external.dto';

/**
 * Controlador de firma electrónica — rutas PÚBLICAS para firmantes externos.
 *
 * Prefijo: /public/signature
 *
 * Todos los endpoints están marcados con @Public() — no requieren JWT de SEÑAL.
 * La autenticación es el token de firma de un solo uso en la URL.
 *
 * Estas rutas corresponden a la ruta /firma/:token del frontend.
 */
@Public()
@Controller('public/signature')
export class PublicSignatureController {
  constructor(
    private readonly signatureService: ElectronicSignatureService,
  ) {}

  /**
   * GET /public/signature/:token
   *
   * - Valida el token (existencia, expiración, no usado)
   * - Marca estado VIEWED + viewed_at en primera apertura
   * - Retorna: datos del firmante, contenido del permiso en secciones, config de firma
   *
   * Errores específicos con códigos legibles por el frontend:
   * - TOKEN_INVALID: el token no existe
   * - TOKEN_USED: ya se firmó con este token
   * - TOKEN_EXPIRED: el token venció
   */
  @Get(':token')
  async getSignatureContent(
    @Param('token') token: string,
    @Req() req: Request,
  ) {
    const ipAddress = this.extractIp(req);
    return this.signatureService.getPublicSignatureContent(token, ipAddress);
  }

  /**
   * POST /public/signature/:token/identity
   *
   * Multipart con:
   * - foto_cedula: imagen frontal de la cédula
   * - selfie: foto del firmante
   *
   * Se suben a Cloudinary en modo 'authenticated' (privado).
   * Se vinculan a la cédula del firmante para no pedirlas en usos futuros.
   */
  @Post(':token/identity')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'foto_cedula', maxCount: 1 },
        { name: 'selfie', maxCount: 1 },
      ],
      {
        storage: memoryStorage(),
        limits: {
          fileSize: 10 * 1024 * 1024, // 10 MB por archivo
        },
        fileFilter: (_req, file, cb) => {
          const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
          if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
          } else {
            cb(new Error('Solo se permiten imágenes JPEG, PNG o WebP'), false);
          }
        },
      },
    ),
  )
  async uploadIdentity(
    @Param('token') token: string,
    @UploadedFiles()
    files: {
      foto_cedula?: Express.Multer.File[];
      selfie?: Express.Multer.File[];
    },
  ) {
    if (!files.foto_cedula?.[0]) {
      return {
        success: false,
        message: 'La foto de la cédula es requerida',
      };
    }
    if (!files.selfie?.[0]) {
      return {
        success: false,
        message: 'La selfie es requerida',
      };
    }

    return this.signatureService.uploadExternalIdentity(
      token,
      files.foto_cedula[0].buffer,
      files.selfie[0].buffer,
    );
  }

  /**
   * POST /public/signature/:token/sign
   *
   * Registra la firma del firmante externo.
   *
   * Body:
   * - stroke_vectors: [{x, y, t}] — trazo vectorial completo
   * - stroke_image_base64: string — imagen PNG del trazo en base64
   * - geo_lat / geo_lng: geolocalización del dispositivo
   * - reading_log: [{section_or_field_id, seconds_viewed}]
   *
   * El servidor agrega: IP real, user-agent, timestamp servidor, hash del documento.
   *
   * Validaciones:
   * - Token válido (no expirado, no usado)
   * - Tiempo mínimo de lectura cumplido (422 si no)
   */
  @Post(':token/sign')
  @HttpCode(HttpStatus.CREATED)
  async signExternal(
    @Param('token') token: string,
    @Body() dto: SignExternalDto,
    @Req() req: Request,
  ) {
    const ipAddress = this.extractIp(req);
    const userAgent = req.headers['user-agent'] ?? 'desconocido';

    return this.signatureService.signExternal(token, dto, ipAddress, userAgent);
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  /** Extrae IP real considerando proxies (X-Forwarded-For) */
  private extractIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.socket?.remoteAddress ?? 'desconocida';
  }
}
