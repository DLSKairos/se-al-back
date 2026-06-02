import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FileStorageService } from './file-storage.service';
import { CreateSesionDto } from './dto/create-sesion.dto';
import { UpdateSesionDto } from './dto/update-sesion.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';

@Injectable()
export class InventariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStorage: FileStorageService,
  ) {}

  // ─── Sesiones ──────────────────────────────────────────────────────────────

  async crearSesion(orgId: string, dto: CreateSesionDto) {
    return this.prisma.inventarioSession.create({
      data: {
        org_id: orgId,
        estado: 'borrador',
        tipo_formulario: dto.tipo_formulario ?? 'acta_inspeccion_previa',
        agencia_aduanas: dto.agencia_aduanas,
        codigo_agencia: dto.codigo_agencia,
        representante_legal: dto.representante_legal,
        mandato: dto.mandato,
        deposito: dto.deposito,
        direccion_deposito: dto.direccion_deposito,
        documento_transporte: dto.documento_transporte,
        manifiesto: dto.manifiesto,
        fecha_manifiesto: dto.fecha_manifiesto ? new Date(dto.fecha_manifiesto) : null,
        transportadora: dto.transportadora,
        consignatario: dto.consignatario,
        no_bultos: dto.no_bultos,
        peso: dto.peso,
        precintos_retira: dto.precintos_retira,
        precintos_coloca: dto.precintos_coloca,
        observaciones: dto.observaciones,
      },
    });
  }

  async listarSesiones(orgId: string) {
    const sesiones = await this.prisma.inventarioSession.findMany({
      where: { org_id: orgId },
      orderBy: { created_at: 'desc' },
      include: {
        _count: {
          select: {
            items: true,
            fotos: true,
          },
        },
      },
    });

    return sesiones;
  }

  async obtenerSesion(orgId: string, id: string) {
    const sesion = await this.prisma.inventarioSession.findFirst({
      where: { id, org_id: orgId },
      include: {
        items: {
          include: {
            accesorios: true,
            fotos: true,
          },
          orderBy: { numero: 'asc' },
        },
        fotos: {
          where: { item_id: null },
          orderBy: { created_at: 'asc' },
        },
      },
    });

    if (!sesion) {
      throw new NotFoundException('Sesión de inventario no encontrada');
    }

    return sesion;
  }

  async actualizarSesion(orgId: string, id: string, dto: UpdateSesionDto) {
    await this._verificarSesion(orgId, id);

    return this.prisma.inventarioSession.update({
      where: { id },
      data: {
        tipo_formulario: dto.tipo_formulario,
        agencia_aduanas: dto.agencia_aduanas,
        codigo_agencia: dto.codigo_agencia,
        representante_legal: dto.representante_legal,
        mandato: dto.mandato,
        deposito: dto.deposito,
        direccion_deposito: dto.direccion_deposito,
        documento_transporte: dto.documento_transporte,
        manifiesto: dto.manifiesto,
        fecha_manifiesto: dto.fecha_manifiesto ? new Date(dto.fecha_manifiesto) : undefined,
        transportadora: dto.transportadora,
        consignatario: dto.consignatario,
        no_bultos: dto.no_bultos,
        peso: dto.peso,
        precintos_retira: dto.precintos_retira,
        precintos_coloca: dto.precintos_coloca,
        observaciones: dto.observaciones,
        estado: dto.estado,
        firmado_deposito_nombre: dto.firmado_deposito_nombre,
        firmado_agencia_nombre: dto.firmado_agencia_nombre,
        firmado_deposito_url: dto.firmado_deposito_url,
        firmado_agencia_url: dto.firmado_agencia_url,
      },
    });
  }

  async eliminarSesion(orgId: string, id: string) {
    const sesion = await this._verificarSesion(orgId, id);

    if (sesion.estado !== 'borrador') {
      throw new BadRequestException(
        'Solo se pueden eliminar sesiones en estado borrador',
      );
    }

    await this.prisma.inventarioSession.delete({ where: { id } });
    return { message: 'Sesión eliminada correctamente' };
  }

  // ─── Items ─────────────────────────────────────────────────────────────────

  async agregarItem(orgId: string, sessionId: string, dto: CreateItemDto) {
    await this._verificarSesion(orgId, sessionId);

    return this.prisma.inventarioItem.create({
      data: {
        session_id: sessionId,
        numero: dto.numero,
        parte_no: dto.parte_no,
        pais: dto.pais,
        descripcion: dto.descripcion,
        marca: dto.marca,
        modelo: dto.modelo,
        serial: dto.serial,
        cantidad: dto.cantidad,
        extraido_por_ia: dto.extraido_por_ia ?? false,
        tipo_novedad: dto.tipo_novedad,
        accesorios: dto.accesorios && dto.accesorios.length > 0
          ? {
              create: dto.accesorios.map((acc) => ({
                parte_no: acc.parte_no,
                pais: acc.pais,
                descripcion: acc.descripcion,
                marca: acc.marca,
                modelo: acc.modelo,
              })),
            }
          : undefined,
      },
      include: {
        accesorios: true,
        fotos: true,
      },
    });
  }

  async actualizarItem(
    orgId: string,
    sessionId: string,
    itemId: string,
    dto: UpdateItemDto,
  ) {
    await this._verificarSesion(orgId, sessionId);
    await this._verificarItem(sessionId, itemId);

    return this.prisma.inventarioItem.update({
      where: { id: itemId },
      data: {
        numero: dto.numero,
        parte_no: dto.parte_no,
        pais: dto.pais,
        descripcion: dto.descripcion,
        marca: dto.marca,
        modelo: dto.modelo,
        serial: dto.serial,
        cantidad: dto.cantidad,
        extraido_por_ia: dto.extraido_por_ia,
        tipo_novedad: dto.tipo_novedad,
      },
      include: {
        accesorios: true,
        fotos: true,
      },
    });
  }

  async eliminarItem(orgId: string, sessionId: string, itemId: string) {
    await this._verificarSesion(orgId, sessionId);
    await this._verificarItem(sessionId, itemId);

    await this.prisma.inventarioItem.delete({ where: { id: itemId } });
    return { message: 'Ítem eliminado correctamente' };
  }

  // ─── Fotos ─────────────────────────────────────────────────────────────────

  async subirFoto(
    orgId: string,
    sessionId: string,
    tipo: string,
    file: Express.Multer.File,
    itemId?: string,
  ) {
    await this._verificarSesion(orgId, sessionId);

    if (itemId) {
      await this._verificarItem(sessionId, itemId);
    }

    const url = await this.fileStorage.upload(
      file.buffer,
      file.originalname,
      file.mimetype,
    );

    return this.prisma.inventarioFoto.create({
      data: {
        session_id: sessionId,
        item_id: itemId ?? null,
        tipo,
        url,
      },
    });
  }

  async eliminarFoto(orgId: string, sessionId: string, fotoId: string) {
    await this._verificarSesion(orgId, sessionId);

    const foto = await this.prisma.inventarioFoto.findFirst({
      where: { id: fotoId, session_id: sessionId },
    });

    if (!foto) {
      throw new NotFoundException('Foto no encontrada');
    }

    await this.prisma.inventarioFoto.delete({ where: { id: fotoId } });
    return { message: 'Foto eliminada correctamente' };
  }

  // ─── Firma ─────────────────────────────────────────────────────────────────

  async firmarSesion(
    orgId: string,
    id: string,
    dto: {
      deposito?: { nombre: string; url: string };
      agencia?: { nombre: string; url: string };
    },
  ) {
    const sesion = await this._verificarSesion(orgId, id);

    const depositoNombre = dto.deposito?.nombre ?? sesion.firmado_deposito_nombre;
    const depositoUrl = dto.deposito?.url ?? sesion.firmado_deposito_url;
    const agenciaNombre = dto.agencia?.nombre ?? sesion.firmado_agencia_nombre;
    const agenciaUrl = dto.agencia?.url ?? sesion.firmado_agencia_url;

    const ambasFirmas =
      !!depositoNombre && !!depositoUrl && !!agenciaNombre && !!agenciaUrl;

    return this.prisma.inventarioSession.update({
      where: { id },
      data: {
        firmado_deposito_nombre: depositoNombre,
        firmado_deposito_url: depositoUrl,
        firmado_deposito_at: dto.deposito ? new Date() : sesion.firmado_deposito_at,
        firmado_agencia_nombre: agenciaNombre,
        firmado_agencia_url: agenciaUrl,
        firmado_agencia_at: dto.agencia ? new Date() : sesion.firmado_agencia_at,
        estado: ambasFirmas ? 'firmado' : sesion.estado,
      },
    });
  }

  // ─── PDF ───────────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async generarPdf(_orgId: string, _id: string) {
    return { message: 'PDF generation not yet implemented' };
  }

  // ─── Helpers privados ──────────────────────────────────────────────────────

  private async _verificarSesion(orgId: string, id: string) {
    const sesion = await this.prisma.inventarioSession.findFirst({
      where: { id, org_id: orgId },
    });

    if (!sesion) {
      throw new NotFoundException('Sesión de inventario no encontrada');
    }

    return sesion;
  }

  private async _verificarItem(sessionId: string, itemId: string) {
    const item = await this.prisma.inventarioItem.findFirst({
      where: { id: itemId, session_id: sessionId },
    });

    if (!item) {
      throw new NotFoundException('Ítem no encontrado en esta sesión');
    }

    return item;
  }
}
