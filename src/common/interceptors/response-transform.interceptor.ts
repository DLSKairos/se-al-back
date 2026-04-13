import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
}

/**
 * Envuelve las respuestas exitosas en { success: true, data: ... }.
 * Excepciones:
 *   - Respuestas Buffer/Stream (descargas): se dejan pasar sin envolver.
 *   - Cuando el handler ya envió la respuesta directamente (@Res sin passthrough).
 */
@Injectable()
export class ResponseTransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T> | T>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T> | T> {
    const httpCtx = context.switchToHttp();
    const response = httpCtx.getResponse<Response>();

    return next.handle().pipe(
      map((data) => {
        // Si el handler escribió directamente en la respuesta (e.g. descargas),
        // no hay nada que transformar — el stream ya fue enviado.
        if (response.headersSent) return data as T;

        // Buffers y streams de descarga no se envuelven en JSON.
        if (data instanceof Buffer || isReadableStream(data)) return data as T;

        return { success: true, data } as ApiResponse<T>;
      }),
    );
  }
}

function isReadableStream(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).pipe === 'function'
  );
}
