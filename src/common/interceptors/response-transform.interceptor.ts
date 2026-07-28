import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  SetMetadata,
  CustomDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export const SKIP_RESPONSE_TRANSFORM = 'skipResponseTransform';

/**
 * Marks a route (or a whole controller) to bypass the global response envelope —
 * e.g. health checks and HTML view renders that must keep their native shape.
 */
export const SkipResponseTransform = (): CustomDecorator =>
  SetMetadata(SKIP_RESPONSE_TRANSFORM, true);

// NestJS stores the @Render() template name under this metadata key.
const RENDER_METADATA = '__renderTemplate__';

/**
 * Wraps every successful HTTP JSON response in a uniform envelope
 * `{ success: true, data, ... }` so the API surface is consistent for clients.
 *
 * - Handlers that already return an envelope (an object with a `success` key)
 *   pass through unchanged — the many hand-rolled `{ success, data, message }`
 *   returns keep working, and their `message`/`meta` are preserved.
 * - Bare objects/arrays/primitives are wrapped as `{ success: true, data }`.
 * - `@Render()` view handlers and routes marked `@SkipResponseTransform()` are
 *   left untouched.
 *
 * Errors never reach here — they are shaped by the global HttpExceptionFilter.
 */
@Injectable()
export class ResponseTransformInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_RESPONSE_TRANSFORM,
      [context.getHandler(), context.getClass()],
    );
    const isView = !!this.reflector.get(RENDER_METADATA, context.getHandler());
    if (skip || isView) {
      return next.handle();
    }

    return next.handle().pipe(
      map((body) => {
        // Already an envelope (hand-rolled { success, ... }) → pass through.
        if (
          body !== null &&
          typeof body === 'object' &&
          !Array.isArray(body) &&
          'success' in (body as Record<string, unknown>)
        ) {
          return body;
        }
        return { success: true, data: body ?? null };
      }),
    );
  }
}
