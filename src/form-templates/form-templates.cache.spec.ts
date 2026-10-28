import { FormTemplatesService } from './form-templates.service';

const tpl = (id: string, titles: string[]) => ({ id, name: id, target_job_titles: titles, fields: [] });

describe('FormTemplatesService — caché de plantillas activas', () => {
  const rows = [tpl('todas', []), tpl('soldadores', ['Soldador']), tpl('electricistas', ['Electricista'])];
  const prisma: any = { formTemplate: { findMany: jest.fn().mockResolvedValue(rows) } };
  const redis: any = {
    remember: jest.fn((_k: string, _t: number, loader: () => Promise<unknown>) => loader()),
    safeDel: jest.fn().mockResolvedValue(undefined),
  };
  const service = new FormTemplatesService(prisma, redis);

  beforeEach(() => jest.clearAllMocks());

  it('cachea por org y filtra por cargo DESPUÉS (la caché sirve a todos los roles)', async () => {
    const op = await service.findActive('org1', 'OPERATOR', ' soldador ');
    expect(op.map((t: any) => t.id)).toEqual(['todas', 'soldadores']);
    expect(redis.remember).toHaveBeenCalledWith('cache:templates:active:org1', expect.any(Number), expect.any(Function));

    const admin = await service.findActive('org1', 'ADMIN', '');
    expect(admin).toHaveLength(3);
  });

  it('invalidateCache borra la clave de la org', async () => {
    await service.invalidateCache('org1');
    expect(redis.safeDel).toHaveBeenCalledWith('cache:templates:active:org1');
  });
});
