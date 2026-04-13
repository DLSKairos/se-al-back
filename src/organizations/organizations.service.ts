import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.organization.findMany({
      orderBy: { created_at: 'desc' },
      select: { id: true, name: true, created_at: true },
    });
  }

  async findById(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      select: { id: true, name: true, created_at: true },
    });
    if (!org) throw new NotFoundException(`Organización ${id} no encontrada`);
    return org;
  }

  async create(dto: CreateOrganizationDto) {
    const existing = await this.prisma.organization.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException(`Ya existe una organización con el nombre "${dto.name}"`);
    }
    return this.prisma.organization.create({
      data: { name: dto.name },
      select: { id: true, name: true, created_at: true },
    });
  }

  async update(id: string, dto: UpdateOrganizationDto) {
    await this.findById(id);

    if (dto.name) {
      const conflict = await this.prisma.organization.findFirst({
        where: { name: dto.name, NOT: { id } },
      });
      if (conflict) {
        throw new ConflictException(`Ya existe una organización con el nombre "${dto.name}"`);
      }
    }

    return this.prisma.organization.update({
      where: { id },
      data: dto,
      select: { id: true, name: true, created_at: true },
    });
  }
}
