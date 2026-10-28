import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Agrega a DATABASE_URL los parámetros del pool si no están ya presentes:
 * - connection_limit (DB_POOL_SIZE, def. 10): conexiones POR instancia. Total en
 *   Postgres = instancias × este valor; debe quedar por debajo de max_connections.
 * - pool_timeout (DB_POOL_TIMEOUT s, def. 20): espera máxima por una conexión libre.
 * Si la URL ya define alguno, se respeta.
 */
export function withPoolParams(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.has('connection_limit')) {
      u.searchParams.set('connection_limit', process.env.DB_POOL_SIZE ?? '10');
    }
    if (!u.searchParams.has('pool_timeout')) {
      u.searchParams.set('pool_timeout', process.env.DB_POOL_TIMEOUT ?? '20');
    }
    return u.toString();
  } catch {
    return url;
  }
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({ datasourceUrl: withPoolParams(process.env.DATABASE_URL) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
