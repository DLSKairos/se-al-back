import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { ResponseTransformInterceptor } from './response-transform.interceptor';

function makeContext(headersSent = false): ExecutionContext {
  return {
    switchToHttp: jest.fn().mockReturnValue({
      getResponse: jest.fn().mockReturnValue({ headersSent }),
      getRequest: jest.fn().mockReturnValue({}),
    }),
  } as unknown as ExecutionContext;
}

function makeHandler(value: unknown): CallHandler {
  return {
    handle: jest.fn().mockReturnValue(of(value)),
  };
}

describe('ResponseTransformInterceptor', () => {
  let interceptor: ResponseTransformInterceptor<unknown>;

  beforeEach(() => {
    interceptor = new ResponseTransformInterceptor();
  });

  it('should wrap plain object in { success: true, data: ... }', (done) => {
    const context = makeContext(false);
    const handler = makeHandler({ id: 1, name: 'test' });

    interceptor.intercept(context, handler).subscribe((result) => {
      expect(result).toEqual({ success: true, data: { id: 1, name: 'test' } });
      done();
    });
  });

  it('should wrap null value in { success: true, data: null }', (done) => {
    const context = makeContext(false);
    const handler = makeHandler(null);

    interceptor.intercept(context, handler).subscribe((result) => {
      expect(result).toEqual({ success: true, data: null });
      done();
    });
  });

  it('should wrap array in { success: true, data: [...] }', (done) => {
    const context = makeContext(false);
    const handler = makeHandler([1, 2, 3]);

    interceptor.intercept(context, handler).subscribe((result) => {
      expect(result).toEqual({ success: true, data: [1, 2, 3] });
      done();
    });
  });

  it('should wrap string value', (done) => {
    const context = makeContext(false);
    const handler = makeHandler('hello');

    interceptor.intercept(context, handler).subscribe((result) => {
      expect(result).toEqual({ success: true, data: 'hello' });
      done();
    });
  });

  it('should pass through data when headers are already sent', (done) => {
    const context = makeContext(true);
    const data = { id: 1 };
    const handler = makeHandler(data);

    interceptor.intercept(context, handler).subscribe((result) => {
      expect(result).toEqual(data);
      done();
    });
  });

  it('should pass through Buffer without wrapping', (done) => {
    const context = makeContext(false);
    const buffer = Buffer.from('raw data');
    const handler = makeHandler(buffer);

    interceptor.intercept(context, handler).subscribe((result) => {
      expect(result).toBe(buffer);
      done();
    });
  });

  it('should pass through stream-like object without wrapping', (done) => {
    const context = makeContext(false);
    const streamLike = { pipe: jest.fn() };
    const handler = makeHandler(streamLike);

    interceptor.intercept(context, handler).subscribe((result) => {
      expect(result).toBe(streamLike);
      done();
    });
  });
});
