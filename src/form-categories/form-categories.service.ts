import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CACHE_TTL, cacheKeys } from '../common/cache-keys';
import { CreateFormCategoryDto } from './dto/create-form-category.dto';
import { UpdateFormCategoryDto } from './dto/update-form-category.dto';

@Injectable()
export class FormCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async findAll(orgId: string) {
    return this.redis.remember(cacheKeys.categories(orgId), CACHE_TTL.CATALOG, () =>
      this.prisma.formCategory.findMany({
        where: { org_id: orgId },
        orderBy: { name: 'asc' },
      }),
    );
  }

  async findOne(id: string, orgId: string) {
    const category = await this.prisma.formCategory.findFirst({
      where: { id, org_id: orgId },
    });

    if (!category) {
      throw new NotFoundException('Categoría de formulario no encontrada');
    }

    return category;
  }

  async create(orgId: string, dto: CreateFormCategoryDto) {
    const existing = await this.prisma.formCategory.findFirst({
      where: { org_id: orgId, name: dto.name },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe una categoría con el nombre "${dto.name}"`,
      );
    }

    const created = await this.prisma.formCategory.create({
      data: {
        org_id: orgId,
        name: dto.name,
      },
    });
    await this.invalidateCache(orgId);
    return created;
  }

  async update(id: string, orgId: string, dto: UpdateFormCategoryDto) {
    await this.findOne(id, orgId);

    const updated = await this.prisma.formCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
      },
    });
    await this.invalidateCache(orgId);
    return updated;
  }

  async remove(id: string, orgId: string): Promise<void> {
    await this.findOne(id, orgId);

    const linkedTemplates = await this.prisma.formTemplate.count({
      where: { category_id: id },
    });

    if (linkedTemplates > 0) {
      throw new ConflictException(
        `No se puede eliminar la categoría porque tiene ${linkedTemplates} plantilla(s) asociada(s)`,
      );
    }

    await this.prisma.formCategory.delete({ where: { id } });
    await this.invalidateCache(orgId);
  }

  /** La categoría viaja embebida en las plantillas activas: se invalidan ambas cachés. */
  private invalidateCache(orgId: string): Promise<void> {
    return this.redis.safeDel(cacheKeys.categories(orgId), cacheKeys.activeTemplates(orgId));
  }
}
