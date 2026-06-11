import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';

/**
 * Rechaza hostnames privados o de loopback para prevenir SSRF (Fix #13).
 */
function rejectPrivateHostname(url: string): void {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    throw new BadRequestException('URL inválida');
  }

  const privatePatterns = [
    /^localhost$/,
    /^127\./,
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^169\.254\./,
    /^::1$/,
    /^0\.0\.0\.0$/,
    /^fc[0-9a-f]{2}:/i, // IPv6 unique local
  ];

  if (privatePatterns.some((p) => p.test(hostname))) {
    throw new BadRequestException(
      'No se permiten URLs con direcciones de red privada',
    );
  }
}

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
    // Validar que no sea un hostname privado (Fix #13)
    rejectPrivateHostname(dto.url);

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
    // Validar hostname privado si se actualiza la URL (Fix #13)
    if (dto.url) {
      rejectPrivateHostname(dto.url);
    }

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
