import { JwtService } from '@nestjs/jwt';
import { AppThrottlerGuard } from './app-throttler.guard';
import { RedisThrottlerStorage } from './redis-throttler.storage';
import { withPoolParams } from '../../prisma/prisma.service';

const SECRET = 'test-secret';
const guard = new AppThrottlerGuard(
  { throttlers: [{ name: 'short', ttl: 1000, limit: 1 }] } as any,
  {} as any,
  {} as any,
  { getOrThrow: () => SECRET } as any,
);
const tracker = (req: any) => (guard as any).getTracker(req) as Promise<string>;

describe('AppThrottlerGuard.getTracker', () => {
  const jwt = new JwtService({ secret: SECRET });

  it('usa el usuario si el JWT es válido (cuadrillas con la misma IP no se pisan)', async () => {
    const token = jwt.sign({ sub: 'user-1' });
    expect(await tracker({ ip: '1.1.1.1', headers: { authorization: `Bearer ${token}` } })).toBe('u:user-1');
  });

  it('token firmado con otra clave → cae a la IP (no evade ni suplanta)', async () => {
    const forged = new JwtService({ secret: 'otra' }).sign({ sub: 'victima' });
    expect(await tracker({ ip: '2.2.2.2', headers: { authorization: `Bearer ${forged}` } })).toBe('ip:2.2.2.2');
  });

  it('sin token → IP', async () => {
    expect(await tracker({ ip: '3.3.3.3', headers: {} })).toBe('ip:3.3.3.3');
  });
});

describe('RedisThrottlerStorage', () => {
  it('fail-open: si Redis falla deja pasar la request', async () => {
    const storage = new RedisThrottlerStorage({
      getClient: () => {
        throw new Error('down');
      },
    } as any);
    const rec = await storage.increment('k', 1000, 5, 0, 'short');
    expect(rec.isBlocked).toBe(false);
    expect(rec.totalHits).toBe(0);
  });
});

describe('withPoolParams', () => {
  const OLD = { ...process.env };
  afterEach(() => (process.env = { ...OLD }));

  it('agrega connection_limit y pool_timeout por defecto', () => {
    delete process.env.DB_POOL_SIZE;
    delete process.env.DB_POOL_TIMEOUT;
    const u = new URL(withPoolParams('postgresql://u:p@h:5432/db')!);
    expect(u.searchParams.get('connection_limit')).toBe('10');
    expect(u.searchParams.get('pool_timeout')).toBe('20');
  });

  it('respeta lo que ya trae la URL y las variables de entorno', () => {
    process.env.DB_POOL_SIZE = '25';
    const u = new URL(withPoolParams('postgresql://u:p@h/db?pool_timeout=5')!);
    expect(u.searchParams.get('connection_limit')).toBe('25');
    expect(u.searchParams.get('pool_timeout')).toBe('5');
  });

  it('no rompe con URL inválida o ausente', () => {
    expect(withPoolParams(undefined)).toBeUndefined();
    expect(withPoolParams('no-es-url')).toBe('no-es-url');
  });
});
