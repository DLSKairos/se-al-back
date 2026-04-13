import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(orgId: string) {
    return this.prisma.department.findMany({
      where: { org_id: orgId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, orgId: string) {
    const dept = await this.prisma.department.findFirst({
      where: { id, org_id: orgId },
    });

    if (!dept) {
      throw new NotFoundException('Departamento no encontrado');
    }

    return dept;
  }

  async create(orgId: string, dto: CreateDepartmentDto) {
    const existing = await this.prisma.department.findFirst({
      where: { org_id: orgId, name: dto.name },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe un departamento con el nombre "${dto.name}"`,
      );
    }

    return this.prisma.department.create({
      data: {
        org_id: orgId,
        name: dto.name,
        email: dto.email,
      },
    });
  }

  async update(id: string, orgId: string, dto: UpdateDepartmentDto) {
    await this.findOne(id, orgId);

    return this.prisma.department.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.email !== undefined && { email: dto.email }),
      },
    });
  }

  async remove(id: string, orgId: string): Promise<void> {
    await this.findOne(id, orgId);

    const linkedLocations = await this.prisma.workLocation.count({
      where: { department_id: id },
    });

    if (linkedLocations > 0) {
      throw new ConflictException(
        `No se puede eliminar el departamento porque tiene ${linkedLocations} obra(s) asociada(s)`,
      );
    }

    await this.prisma.department.delete({ where: { id } });
  }
}
