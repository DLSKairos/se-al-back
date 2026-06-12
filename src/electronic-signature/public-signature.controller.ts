import {
  BadRequestException,
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
import { Throttle } from '@nestjs/throttler';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { ElectronicSignatureService } from './electronic-signature.service';
import { SignExternalDto } from './dto/sign-external.dto';

// ─── Magic bytes para validación de tipo real de imagen ───────────────────────

/** Firma de bytes JPEG: FF D8 FF */
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
/** Firma de bytes PNG: 89 50 4E 47 0D 0A 1A 0A */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Firma de bytes WebP: RIFF....WEBP (bytes 0-3 y 8-11) */
const WEBP_RIFF = Buffer.from([0x52, 0x49, 0x46, 0x46]);
const WEBP_WEBP = Buffer.from([0x57, 0x45, 0x42, 0x50]);

/**
 * S-10: valida que el buffer corresponde a una imagen JPEG, PNG o WebP
 * verificando los magic bytes reales del archivo (no el campo mimetype que
 * el cliente puede falsificar).
 */
function validateImageMagicBytes(buf: Buffer, fieldName: string): void {
  if (buf.length < 12) {
    throw new BadRequestException(`${fieldName}: archivo demasiado pequeño para ser una imagen válida`);
  }

  const isJpeg = buf.subarray(0, 3).equals(JPEG_MAGIC);
  const isPng = buf.subarray(0, 8).equals(PNG_MAGIC);
  const isWebp =
    buf.subarray(0, 4).equals(WEBP_RIFF) &&
    buf.subarray(8, 12).equals(WEBP_WEBP);

  if (!isJpeg && !isPng && !isWebp) {
    throw new BadRequestException(
      `${fieldName}: el archivo no es una imagen JPEG, PNG o WebP válida`,
    );
  }
}

/**
 * Controlador de firma electrónica — rutas PÚBLICAS para firmantes externos.
 *
 * Prefijo: /public/signature
 *
 * Todos los endpoints están marcados con @Public() — no requieren JWT de SEÑAL.
 * La autenticación es el token de firma de un solo uso en la URL.
 *
 * Estas rutas corresponden a la ruta /firma/:token del frontend.
 *
 * S-02: throttle más estricto (10 req/60s) porque son rutas públicas y de alto
 * valor (contienen evidencia legal de firma).
 */
@Public()
@Throttle({ short: { ttl: 60_000, limit: 10 } })
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

    // S-10: validar magic bytes antes de procesar (el mimetype del cliente puede falsificarse)
    validateImageMagicBytes(files.foto_cedula[0].buffer, 'foto_cedula');
    validateImageMagicBytes(files.selfie[0].buffer, 'selfie');

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

  /**
   * S-04: usa req.ip que Express resuelve correctamente a través del proxy
   * cuando trust proxy está activo (configurado en main.ts).
   * Evita parsear manualmente x-forwarded-for (spoofable si el header se
   * pasa directo al backend sin pasar por el proxy confiable).
   */
  private extractIp(req: Request): string {
    return req.ip ?? req.socket?.remoteAddress ?? 'desconocida';
  }
}
