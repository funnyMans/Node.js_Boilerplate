import { describe, expect, it, vi } from 'vitest';
import { createDomainEvent } from '@app/contracts';
import { startUserCreatedWorkflowFromEvent } from '../../src/temporal';
import { publishEvent } from '../../src/nats';

describe('user-created event smoke flow', () => {
  it('publishes a user-created event and starts the matching durable workflow', async () => {
    const workflow = {
      start: vi.fn().mockResolvedValue({ workflowId: 'wf-user-42', runId: 'run-42' }),
    };

    const published: Array<{ subject: string; body: any }> = [];
    const event = createDomainEvent({
      eventType: 'user.created.v1',
      sourceService: 'users-service',
      correlationId: 'corr-smoke-1',
      traceId: 'trace-smoke-1',
      payload: {
        userId: 'u_42',
        email: 'person@example.com',
        status: 'active',
      },
    });

    const nc = {
      publish: (subject: string, data: Uint8Array) => {
        published.push({
          subject,
          body: JSON.parse(new TextDecoder().decode(data)),
        });
      },
    } as any;

    await publishEvent(nc, 'app.users.v1.user.created', event);

    const delivered = published[0].body;
    const result = await startUserCreatedWorkflowFromEvent({ workflow }, delivered as typeof event);

    expect(published).toHaveLength(1);
    expect(published[0].subject).toBe('app.users.v1.user.created');
    expect(workflow.start).toHaveBeenCalledTimes(1);
    expect(workflow.start.mock.calls[0][0]).toBe('UserCreatedWorkflow');
    expect(workflow.start.mock.calls[0][1]).toMatchObject({
      taskQueue: 'user-events',
      workflowId: 'user-created-u_42',
      args: [
        expect.objectContaining({
          userId: 'u_42',
          email: 'person@example.com',
          correlationId: 'corr-smoke-1',
          traceId: 'trace-smoke-1',
        }),
      ],
    });
    expect(result).toEqual({ workflowId: 'wf-user-42', runId: 'run-42' });
  });
});
