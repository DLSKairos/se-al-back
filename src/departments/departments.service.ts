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

  /**
   * Devuelve los departamentos visibles para una organización:
   * - Los propios de la org (org_id === orgId, active = true)
   * - Los globales de Kairos (org_id = null, active = true)
   * Los globales no se pueden editar ni eliminar desde aquí (solo desde seed).
   */
  async findAll(orgId: string) {
    return this.prisma.department.findMany({
      where: {
        OR: [
          { org_id: orgId, active: true },
          { org_id: null, active: true },
        ],
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Busca un departamento por id verificando que pertenezca a la org.
   * Los departamentos globales (org_id = null) no son accesibles por este método
   * (no se pueden editar/eliminar desde un admin de org).
   */
  async findOne(id: string, orgId: string) {
    const dept = await this.prisma.department.findFirst({
      where: { id, org_id: orgId },
    });

    if (!dept) {
      throw new NotFoundException('Departamento no encontrado');
    }

    return dept;
  }

  /**
   * Crea un departamento propio de la organización.
   * Los departamentos globales solo los crea Kairos desde seed.
   * Verifica duplicado contra los propios de la org (no contra globales).
   */
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

  /**
   * Actualiza un departamento propio de la org.
   * Garantiza que solo se puedan actualizar departamentos de la propia org.
   */
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

  /**
   * Elimina (soft delete: active = false) un departamento propio de la org.
   * No permite eliminar departamentos globales (son de Kairos).
   * No permite eliminar si tiene obras asociadas activas.
   */
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

    await this.prisma.department.update({
      where: { id },
      data: { active: false },
    });
  }
}
