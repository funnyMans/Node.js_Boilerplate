import { Connection, Client } from '@temporalio/client';

export async function createTemporalClient(options?: { address?: string }) {
  const addr = options?.address ?? process.env.TEMPORAL_ADDRESS ?? '127.0.0.1:7233';
  const connection = await Connection.connect({ address: addr });
  return new Client({ connection });
}

export type UserCreatedWorkflowInput = {
  userId: string;
  email: string;
  status: string;
  correlationId?: string;
  traceId?: string;
};

export async function startUserCreatedWorkflow(
  client: { workflow: { start: Function } },
  input: UserCreatedWorkflowInput
) {
  return client.workflow.start('UserCreatedWorkflow', {
    taskQueue: 'user-events',
    workflowId: `user-created-${input.userId}`,
    args: [input],
    retry: {
      maximumAttempts: 3,
    },
  });
}

export async function startUserCreatedWorkflowFromEvent(
  client: { workflow: { start: Function } },
  event: {
    payload: Omit<UserCreatedWorkflowInput, 'correlationId' | 'traceId'>;
    correlationId?: string;
    traceId?: string;
  }
) {
  const input: UserCreatedWorkflowInput = {
    userId: event.payload.userId,
    email: event.payload.email,
    status: event.payload.status,
    correlationId: event.correlationId,
    traceId: event.traceId,
  };

  return startUserCreatedWorkflow(client, input);
}
