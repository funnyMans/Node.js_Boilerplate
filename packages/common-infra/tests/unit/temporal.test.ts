import { describe, expect, it, vi } from 'vitest';
import { startUserCreatedWorkflow } from '../../src/temporal';

describe('temporal workflow helpers', () => {
  it('starts a user-created workflow with the expected durable config', async () => {
    const start = vi.fn().mockResolvedValue({ workflowId: 'wf-user-123', runId: 'run-1' });
    const client = {
      workflow: { start },
    };

    const result = await startUserCreatedWorkflow(client, {
      userId: 'u_123',
      email: 'person@example.com',
      correlationId: 'corr-1',
      traceId: 'trace-1',
      status: 'active',
    });

    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0][0]).toBe('UserCreatedWorkflow');
    expect(start.mock.calls[0][1]).toMatchObject({
      taskQueue: 'user-events',
      workflowId: 'user-created-u_123',
      retry: {
        maximumAttempts: 3,
      },
    });
    expect(result).toEqual({ workflowId: 'wf-user-123', runId: 'run-1' });
  });
});
