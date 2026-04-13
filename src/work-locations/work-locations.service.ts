import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkLocationDto } from './dto/create-work-location.dto';
import { UpdateWorkLocationDto } from './dto/update-work-location.dto';

interface Coordinates {
  lat: number;
  lng: number;
}

@Injectable()
export class WorkLocationsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Consultas ─────────────────────────────────────────────────────────────

  async findActive(orgId: string) {
    return this.prisma.workLocation.findMany({
      where: { org_id: orgId, is_active: true },
      include: { department: true },
      orderBy: { name: 'asc' },
    });
  }

  async findAll(orgId: string) {
    return this.prisma.workLocation.findMany({
      where: { org_id: orgId },
      include: { department: true },
      orderBy: { name: 'asc' },
    });
  }

  // ─── Mutaciones ────────────────────────────────────────────────────────────

  async create(orgId: string, dto: CreateWorkLocationDto) {
    let lat: number;
    let lng: number;

    if (dto.lat !== undefined && dto.lng !== undefined) {
      lat = dto.lat;
      lng = dto.lng;
    } else if (dto.address) {
      const coords = await this.geocodeAddress(dto.address);
      lat = coords.lat;
      lng = coords.lng;
    } else {
      throw new BadRequestException(
        'Se requiere dirección (address) o coordenadas (lat/lng) para crear una ubicación',
      );
    }

    return this.prisma.workLocation.create({
      data: {
        org_id: orgId,
        name: dto.name,
        contractor: dto.contractor ?? '',
        lat,
        lng,
        department_id: dto.department_id ?? null,
      },
      include: { department: true },
    });
  }

  async update(id: string, orgId: string, dto: UpdateWorkLocationDto) {
    await this.assertExists(id, orgId);

    // Si viene address sin coordenadas, geocodificar
    let coords: Coordinates | undefined;
    if (
      dto.address &&
      dto.lat === undefined &&
      dto.lng === undefined
    ) {
      coords = await this.geocodeAddress(dto.address);
    }

    return this.prisma.workLocation.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.contractor !== undefined && { contractor: dto.contractor }),
        ...(dto.department_id !== undefined && {
          department_id: dto.department_id,
        }),
        ...(dto.lat !== undefined && { lat: dto.lat }),
        ...(dto.lng !== undefined && { lng: dto.lng }),
        ...(coords && { lat: coords.lat, lng: coords.lng }),
      },
      include: { department: true },
    });
  }

  async toggleActive(id: string, orgId: string) {
    const location = await this.assertExists(id, orgId);

    return this.prisma.workLocation.update({
      where: { id },
      data: { is_active: !location.is_active },
    });
  }

  // ─── Geocoding ─────────────────────────────────────────────────────────────

  async geocodeAddress(address: string): Promise<Coordinates> {
    const encoded = encodeURIComponent(address);
    const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          'User-Agent': 'SENAL-App/1.0 (admin@senal.app)',
          'Accept-Language': 'es',
        },
      });
    } catch {
      throw new BadRequestException(
        'No se pudo conectar al servicio de geocodificación',
      );
    }

    if (!response.ok) {
      throw new BadRequestException(
        `Error al geocodificar la dirección: ${response.statusText}`,
      );
    }

    const data = (await response.json()) as Array<{
      lat: string;
      lon: string;
    }>;

    if (!data || data.length === 0) {
      throw new BadRequestException(
        `No se encontraron coordenadas para la dirección: "${address}"`,
      );
    }

    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async assertExists(id: string, orgId: string) {
    const location = await this.prisma.workLocation.findFirst({
      where: { id, org_id: orgId },
    });

    if (!location) {
      throw new NotFoundException('Ubicación de trabajo no encontrada');
    }

    return location;
  }
}
