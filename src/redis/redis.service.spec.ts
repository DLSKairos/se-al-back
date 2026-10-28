import { RedisService } from './redis.service';

function build(client: Record<string, jest.Mock>) {
  const svc = new RedisService({ get: jest.fn() } as any);
  (svc as any).client = client;
  return svc;
}

describe('RedisService — helpers fail-open', () => {
  it('remember: miss → ejecuta loader y guarda con TTL', async () => {
    const client = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK') };
    const loader = jest.fn().mockResolvedValue({ a: 1 });
    const svc = build(client);

    expect(await svc.remember('k', 60, loader)).toEqual({ a: 1 });
    expect(client.set).toHaveBeenCalledWith('k', '{"a":1}', 'EX', 60);
  });

  it('remember: hit → no ejecuta loader', async () => {
    const client = { get: jest.fn().mockResolvedValue('{"a":2}'), set: jest.fn() };
    const loader = jest.fn();
    expect(await build(client).remember('k', 60, loader)).toEqual({ a: 2 });
    expect(loader).not.toHaveBeenCalled();
  });

  it('remember: caché corrupta → recarga', async () => {
    const client = { get: jest.fn().mockResolvedValue('{no-json'), set: jest.fn().mockResolvedValue('OK') };
    const loader = jest.fn().mockResolvedValue([1]);
    expect(await build(client).remember('k', 60, loader)).toEqual([1]);
  });

  it('remember: Redis caído → sirve desde el loader sin lanzar', async () => {
    const client = {
      get: jest.fn().mockRejectedValue(new Error('down')),
      set: jest.fn().mockRejectedValue(new Error('down')),
    };
    const loader = jest.fn().mockResolvedValue('db');
    await expect(build(client).remember('k', 60, loader)).resolves.toBe('db');
  });

  it('safeDel no lanza si Redis falla', async () => {
    const client = { del: jest.fn().mockRejectedValue(new Error('down')) };
    await expect(build(client).safeDel('a', 'b')).resolves.toBeUndefined();
  });

  it('tryLock: true si adquiere, false si ya existe o Redis falla', async () => {
    const client = { set: jest.fn() };
    const svc = build(client);
    client.set.mockResolvedValueOnce('OK');
    expect(await svc.tryLock('l', 10)).toBe(true);
    expect(client.set).toHaveBeenCalledWith('l', '1', 'EX', 10, 'NX');
    client.set.mockResolvedValueOnce(null);
    expect(await svc.tryLock('l', 10)).toBe(false);
    client.set.mockRejectedValueOnce(new Error('down'));
    expect(await svc.tryLock('l', 10)).toBe(false);
  });
});
