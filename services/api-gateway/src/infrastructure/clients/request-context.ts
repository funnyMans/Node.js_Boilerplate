import type { FastifyRequest } from 'fastify';
import { injectTraceContext } from '@app/common';
import type { SpanContext } from '@opentelemetry/api';

export function getDownstreamRequestContext(request: FastifyRequest): Record<string, string> {
  const incomingCorrelationId = request.headers['x-correlation-id'];
  const correlationId =
    typeof incomingCorrelationId === 'string' &&
    incomingCorrelationId.length > 0 &&
    incomingCorrelationId.length <= 128
      ? incomingCorrelationId
      : request.id;
  const requestContext = request.raw as typeof request.raw & {
    __requestSpan?: { spanContext: () => SpanContext };
  };

  return injectTraceContext(
    { 'x-correlation-id': correlationId },
    requestContext.__requestSpan?.spanContext()
  );
}
