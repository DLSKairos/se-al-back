import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface SubmissionStats {
  total_users: number;
  active_users: number;
  total_submissions: number;
  by_status: {
    APPROVED: number;
    SUBMITTED: number;
    REJECTED: number;
    DRAFT: number;
  };
  trend: Array<{ month: string; submissions: number; unique_users: number }>;
  by_template: Array<{ template_id: string; name: string; count: number }>;
  recent: Array<{
    id: string;
    submitted_by: string;
    template_name: string;
    work_location: string | null;
    submitted_at: Date;
    status: string;
  }>;
}

type TrendRow = { month: string; submissions: bigint; unique_users: bigint };

@Injectable()
export class FormSubmissionsStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(
    orgId: string,
    templateId?: string,
    from?: string,
    to?: string,
  ): Promise<SubmissionStats> {
    const dateFilter = this.buildDateFilter(from, to);
    const templateFilter = templateId ? { template_id: templateId } : {};
    const baseWhere = { org_id: orgId, ...templateFilter, ...dateFilter };

    const [totalUsers, activeUsers, statusCounts, byTemplate, recent] =
      await Promise.all([
        this.prisma.user.count({ where: { org_id: orgId } }),
        this.prisma.user.count({ where: { org_id: orgId, is_active: true } }),
        this.prisma.formSubmission.groupBy({
          by: ['status'],
          where: baseWhere,
          _count: { status: true },
        }),
        this.prisma.formSubmission.groupBy({
          by: ['template_id'],
          where: baseWhere,
          _count: { template_id: true },
          orderBy: { _count: { template_id: 'desc' } },
        }),
        this.prisma.formSubmission.findMany({
          where: baseWhere,
          orderBy: { submitted_at: 'desc' },
          take: 5,
          include: {
            template: { select: { name: true } },
            work_location: { select: { name: true } },
            submitter: { select: { name: true } },
          },
        }),
      ]);

    // Trend — raw SQL para agrupar por mes con unique_users
    const trendRaw = await this.buildTrendQuery(orgId, templateId);

    // Resolver nombres de templates para by_template
    const templateIds = byTemplate.map((b) => b.template_id);
    const templates =
      templateIds.length > 0
        ? await this.prisma.formTemplate.findMany({
            where: { id: { in: templateIds } },
            select: { id: true, name: true },
          })
        : [];
    const templateMap = new Map(templates.map((t) => [t.id, t.name]));

    // Construir by_status con defaults en 0
    const byStatus = { APPROVED: 0, SUBMITTED: 0, REJECTED: 0, DRAFT: 0 };
    for (const row of statusCounts) {
      byStatus[row.status as keyof typeof byStatus] = row._count.status;
    }

    return {
      total_users: totalUsers,
      active_users: activeUsers,
      total_submissions: Object.values(byStatus).reduce((a, b) => a + b, 0),
      by_status: byStatus,
      trend: trendRaw.map((row) => ({
        month: row.month,
        submissions: Number(row.submissions),
        unique_users: Number(row.unique_users),
      })),
      by_template: byTemplate.map((row) => ({
        template_id: row.template_id,
        name: templateMap.get(row.template_id) ?? row.template_id,
        count: row._count.template_id,
      })),
      recent: recent.map((s) => ({
        id: s.id,
        submitted_by: s.submitter?.name ?? s.submitted_by,
        template_name: s.template.name,
        work_location: s.work_location?.name ?? null,
        submitted_at: s.submitted_at,
        status: s.status,
      })),
    };
  }

  private async buildTrendQuery(
    orgId: string,
    templateId?: string,
  ): Promise<TrendRow[]> {
    if (templateId) {
      return this.prisma.$queryRaw<TrendRow[]>`
        SELECT
          TO_CHAR(DATE_TRUNC('month', submitted_at), 'YYYY-MM') AS month,
          COUNT(*) AS submissions,
          COUNT(DISTINCT submitted_by) AS unique_users
        FROM form_submissions
        WHERE org_id = ${orgId}
          AND template_id = ${templateId}
          AND submitted_at >= DATE_TRUNC('month', NOW() - INTERVAL '5 months')
        GROUP BY DATE_TRUNC('month', submitted_at)
        ORDER BY DATE_TRUNC('month', submitted_at) ASC
      `;
    }

    return this.prisma.$queryRaw<TrendRow[]>`
      SELECT
        TO_CHAR(DATE_TRUNC('month', submitted_at), 'YYYY-MM') AS month,
        COUNT(*) AS submissions,
        COUNT(DISTINCT submitted_by) AS unique_users
      FROM form_submissions
      WHERE org_id = ${orgId}
        AND submitted_at >= DATE_TRUNC('month', NOW() - INTERVAL '5 months')
      GROUP BY DATE_TRUNC('month', submitted_at)
      ORDER BY DATE_TRUNC('month', submitted_at) ASC
    `;
  }

  private buildDateFilter(from?: string, to?: string): Prisma.FormSubmissionWhereInput {
    if (!from && !to) return {};
    const filter: { submitted_at?: { gte?: Date; lte?: Date } } = {
      submitted_at: {},
    };
    if (from) filter.submitted_at!.gte = new Date(from);
    if (to) filter.submitted_at!.lte = new Date(to);
    return filter;
  }
}
