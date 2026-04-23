import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ensureUniqueKeys } from '../common/utils/form-keys.util';
import { CreateFormBlueprintDto } from './dto/create-form-blueprint.dto';
import { QueryFormBlueprintsDto } from './dto/query-form-blueprints.dto';

@Injectable()
export class FormBlueprintsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Consultas ─────────────────────────────────────────────────────────────

  async findAll(orgId: string, query: QueryFormBlueprintsDto) {
    const where: any = {
      OR: [{ is_global: true }, { org_id: orgId }],
    };
    if (query.category) where.category = query.category;
    if (query.search) where.name = { contains: query.search, mode: 'insensitive' };

    return this.prisma.formBlueprint.findMany({
      where,
      orderBy: [{ is_global: 'desc' }, { name: 'asc' }],
    });
  }

  // ─── Mutaciones ────────────────────────────────────────────────────────────

  async create(orgId: string, dto: CreateFormBlueprintDto) {
    return this.prisma.formBlueprint.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        category: dto.category,
        fields: dto.fields,
        org_id: orgId,
        is_global: false,
      },
    });
  }

  async use(id: string, orgId: string, createdBy: string) {
    const blueprint = await this.prisma.formBlueprint.findFirst({
      where: { id, OR: [{ is_global: true }, { org_id: orgId }] },
    });
    if (!blueprint) throw new NotFoundException('Blueprint no encontrado');

    let category = await this.prisma.formCategory.findFirst({
      where: { org_id: orgId, name: blueprint.category },
    });
    if (!category) {
      category = await this.prisma.formCategory.create({
        data: { org_id: orgId, name: blueprint.category, is_sst: true },
      });
    }

    const rawFields = Array.isArray(blueprint.fields) ? (blueprint.fields as any[]) : [];
    const uniqueFields = ensureUniqueKeys(rawFields);

    return this.prisma.$transaction(async (tx) => {
      const template = await tx.formTemplate.create({
        data: {
          org_id: orgId,
          category_id: category!.id,
          name: blueprint.name,
          description: blueprint.description ?? null,
          status: 'DRAFT',
          created_by: createdBy,
          sections: undefined,
          columns: 1,
        },
      });

      if (uniqueFields.length > 0) {
        await tx.formField.createMany({
          data: uniqueFields.map((f: any, i: number) => ({
            template_id: template.id,
            order: i,
            label: f.label,
            key: f.key,
            type: f.type ?? 'TEXT',
            required: f.required ?? true,
            options: f.options ?? null,
            section: f.section ?? null,
            placeholder: f.placeholder ?? null,
          })),
        });
      }

      return tx.formTemplate.findUnique({
        where: { id: template.id },
        include: {
          fields: { orderBy: { order: 'asc' } },
          category: true,
        },
      });
    });
  }
}
