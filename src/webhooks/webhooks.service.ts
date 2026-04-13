import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  async findAll(orgId: string) {
    return this.prisma.webhookEndpoint.findMany({
      where: { org_id: orgId, is_active: true },
      orderBy: { created_at: 'desc' },
    });
  }

  async create(orgId: string, dto: CreateWebhookDto) {
    // Generar secret HMAC aleatorio — no usar el que venga del DTO por seguridad
    const secret = crypto.randomBytes(32).toString('hex');

    return this.prisma.webhookEndpoint.create({
      data: {
        org_id: orgId,
        url: dto.url,
        secret,
        event_types: dto.event_types ?? [],
        is_active: true,
      },
    });
  }

  async update(id: string, orgId: string, dto: UpdateWebhookDto) {
    await this.assertExists(id, orgId);

    return this.prisma.webhookEndpoint.update({
      where: { id },
      data: {
        ...(dto.url !== undefined && { url: dto.url }),
        ...(dto.event_types !== undefined && { event_types: dto.event_types }),
        ...(dto.is_active !== undefined && { is_active: dto.is_active }),
      },
    });
  }

  async remove(id: string, orgId: string): Promise<void> {
    await this.assertExists(id, orgId);

    await this.prisma.webhookEndpoint.delete({ where: { id } });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async assertExists(id: string, orgId: string): Promise<void> {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { id, org_id: orgId },
      select: { id: true },
    });

    if (!endpoint) {
      throw new NotFoundException('Webhook endpoint no encontrado');
    }
  }
}
