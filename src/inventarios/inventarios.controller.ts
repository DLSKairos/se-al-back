import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/dto/jwt-payload.dto';
import { InventariosService } from './inventarios.service';
import { InventariosIaService } from './inventarios-ia.service';
import { CreateSesionDto } from './dto/create-sesion.dto';
import { UpdateSesionDto } from './dto/update-sesion.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';

@Controller('inventarios')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventariosController {
  constructor(
    private readonly inventariosService: InventariosService,
    private readonly inventariosIaService: InventariosIaService,
  ) {}

  // ─── Sesiones ──────────────────────────────────────────────────────────────

  @Roles('ADMIN', 'OPERATOR')
  @Post('sesiones')
  @HttpCode(HttpStatus.CREATED)
  crearSesion(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSesionDto,
  ) {
    return this.inventariosService.crearSesion(user.orgId, dto);
  }

  @Roles('ADMIN', 'OPERATOR')
  @Get('sesiones')
  listarSesiones(@CurrentUser() user: JwtPayload) {
    return this.inventariosService.listarSesiones(user.orgId);
  }

  @Roles('ADMIN', 'OPERATOR')
  @Get('sesiones/:id')
  obtenerSesion(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.inventariosService.obtenerSesion(user.orgId, id);
  }

  @Roles('ADMIN', 'OPERATOR')
  @Patch('sesiones/:id')
  actualizarSesion(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateSesionDto,
  ) {
    return this.inventariosService.actualizarSesion(user.orgId, id, dto);
  }

  @Roles('ADMIN', 'OPERATOR')
  @Delete('sesiones/:id')
  eliminarSesion(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.inventariosService.eliminarSesion(user.orgId, id);
  }

  // ─── Items ─────────────────────────────────────────────────────────────────

  @Roles('ADMIN', 'OPERATOR')
  @Post('sesiones/:id/items')
  @HttpCode(HttpStatus.CREATED)
  agregarItem(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateItemDto,
  ) {
    return this.inventariosService.agregarItem(user.orgId, id, dto);
  }

  @Roles('ADMIN', 'OPERATOR')
  @Patch('sesiones/:id/items/:itemId')
  actualizarItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateItemDto,
  ) {
    return this.inventariosService.actualizarItem(user.orgId, id, itemId, dto);
  }

  @Roles('ADMIN', 'OPERATOR')
  @Delete('sesiones/:id/items/:itemId')
  eliminarItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.inventariosService.eliminarItem(user.orgId, id, itemId);
  }

  // ─── Fotos ─────────────────────────────────────────────────────────────────

  @Roles('ADMIN', 'OPERATOR')
  @Post('sesiones/:id/fotos')
  @UseInterceptors(
    FileInterceptor('foto', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new BadRequestException('Solo se aceptan imágenes JPEG, PNG o WebP'), false);
      },
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  subirFoto(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
    @Query('tipo') tipo: string,
    @Query('itemId') itemId?: string,
  ) {
    return this.inventariosService.subirFoto(
      user.orgId,
      id,
      tipo ?? 'general',
      file,
      itemId,
    );
  }

  @Roles('ADMIN', 'OPERATOR')
  @Delete('sesiones/:id/fotos/:fotoId')
  eliminarFoto(
    @Param('id') id: string,
    @Param('fotoId') fotoId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.inventariosService.eliminarFoto(user.orgId, id, fotoId);
  }

  // ─── IA ────────────────────────────────────────────────────────────────────

  @Roles('ADMIN', 'OPERATOR')
  @Post('extraer-factura')
  @UseInterceptors(
    FileInterceptor('imagen', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  extraerFactura(@UploadedFile() file: Express.Multer.File) {
    return this.inventariosIaService.extraerDatosFactura(file);
  }

  // ─── Firma y PDF ───────────────────────────────────────────────────────────

  @Roles('ADMIN', 'OPERATOR')
  @Post('sesiones/:id/firmar')
  firmarSesion(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body()
    dto: {
      deposito?: { nombre: string; url: string };
      agencia?: { nombre: string; url: string };
    },
  ) {
    return this.inventariosService.firmarSesion(user.orgId, id, dto);
  }

  @Roles('ADMIN', 'OPERATOR')
  @Post('sesiones/:id/generar-pdf')
  @HttpCode(HttpStatus.ACCEPTED)
  generarPdf(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    void user;
    void id;
    return { message: 'La generación de PDF estará disponible próximamente.' };
  }
}
