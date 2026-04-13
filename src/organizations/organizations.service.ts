import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Servicio de organizaciones.
 * La implementación será completada por el agente de backend-dev.
 */
@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO: findById(id: string)
  // TODO: update(id: string, data)
}
