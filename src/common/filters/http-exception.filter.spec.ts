import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

function makeHost(url = '/api/test') {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status };
  const request = { url };

  const host = {
    switchToHttp: jest.fn().mockReturnValue({
      getResponse: jest.fn().mockReturnValue(response),
      getRequest: jest.fn().mockReturnValue(request),
    }),
  };

  return { host, json, status };
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
  });

  it('should return 404 for NotFoundException', () => {
    const { host, status, json } = makeHost();
    filter.catch(new NotFoundException('Usuario no encontrado'), host as any);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 404,
      }),
    );
  });

  it('should include the exception message for NotFoundException', () => {
    const { host, json } = makeHost();
    filter.catch(new NotFoundException('Usuario no encontrado'), host as any);

    const body = json.mock.calls[0][0];
    expect(body.message).toBe('Usuario no encontrado');
  });

  it('should return 400 for BadRequestException with array of messages', () => {
    const { host, status, json } = makeHost();
    const exception = new BadRequestException({
      message: ['name should not be empty', 'name must be a string'],
      error: 'Bad Request',
    });

    filter.catch(exception, host as any);

    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0];
    expect(Array.isArray(body.message)).toBe(true);
    expect(body.message).toContain('name should not be empty');
  });

  it('should return 403 for ForbiddenException', () => {
    const { host, status, json } = makeHost();
    filter.catch(new ForbiddenException('Acceso denegado'), host as any);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 403,
      }),
    );
  });

  it('should include path in the response body', () => {
    const { host, json } = makeHost('/api/users');
    filter.catch(new NotFoundException(), host as any);

    const body = json.mock.calls[0][0];
    expect(body.path).toBe('/api/users');
  });

  it('should include timestamp in the response body', () => {
    const { host, json } = makeHost();
    filter.catch(new NotFoundException(), host as any);

    const body = json.mock.calls[0][0];
    expect(body.timestamp).toBeDefined();
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it('should return 500 for unknown non-HTTP errors', () => {
    const { host, status } = makeHost();
    filter.catch(new Error('Something went wrong'), host as any);

    expect(status).toHaveBeenCalledWith(500);
  });

  it('should return 500 for thrown non-Error values', () => {
    const { host, status } = makeHost();
    filter.catch('raw string error', host as any);

    expect(status).toHaveBeenCalledWith(500);
  });
});
