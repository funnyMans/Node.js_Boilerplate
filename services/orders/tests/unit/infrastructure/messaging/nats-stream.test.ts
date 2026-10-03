import { NatsError, RetentionPolicy, StorageType, DiscardPolicy, nanos } from 'nats';
import { describe, expect, it, vi } from 'vitest';
import {
  ensureOrderEventsStream,
  ORDER_EVENTS_DUPLICATE_WINDOW_MS,
  ORDER_EVENTS_MAX_BYTES,
  ORDER_EVENTS_RETENTION_MS,
  ORDER_EVENTS_STREAM,
  ORDER_EVENTS_SUBJECT,
  type OrderEventsStreamAdmin,
  type OrdersStreamConfig,
} from '../../../../src/infrastructure/messaging/nats-stream';

function compatibleConfig(): OrdersStreamConfig {
  return {
    subjects: [ORDER_EVENTS_SUBJECT],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    num_replicas: 1,
    max_age: nanos(ORDER_EVENTS_RETENTION_MS),
    max_bytes: ORDER_EVENTS_MAX_BYTES,
    max_msgs: -1,
    max_msg_size: 1024 * 1024,
    discard: DiscardPolicy.New,
    duplicate_window: nanos(ORDER_EVENTS_DUPLICATE_WINDOW_MS),
  };
}

function streamNotFound(): NatsError {
  const error = new NatsError('stream not found', 'stream_not_found');
  error.api_error = { code: 404, err_code: 10059, description: 'stream not found' };
  return error;
}

describe('ensureOrderEventsStream', () => {
  it('creates a file-backed limits stream when it is missing', async () => {
    let createdConfig: Parameters<OrderEventsStreamAdmin['add']>[0] | undefined;
    const streams: OrderEventsStreamAdmin = {
      info: vi.fn().mockRejectedValueOnce(streamNotFound()).mockResolvedValue({
        config: compatibleConfig(),
      }),
      add: vi.fn(async (config) => {
        createdConfig = config;
      }),
    };

    await ensureOrderEventsStream(streams);

    expect(streams.add).toHaveBeenCalledOnce();
    expect(createdConfig).toMatchObject({
      name: ORDER_EVENTS_STREAM,
      subjects: [ORDER_EVENTS_SUBJECT],
      retention: RetentionPolicy.Limits,
      storage: StorageType.File,
      discard: DiscardPolicy.New,
      max_bytes: ORDER_EVENTS_MAX_BYTES,
      max_msgs: -1,
      max_msg_size: 1024 * 1024,
    });
  });

  it('accepts an existing stream only when its delivery contract matches', async () => {
    const streams: OrderEventsStreamAdmin = {
      info: vi.fn().mockResolvedValue({ config: compatibleConfig() }),
      add: vi.fn(),
    };

    await expect(ensureOrderEventsStream(streams)).resolves.toBeUndefined();
    expect(streams.add).not.toHaveBeenCalled();
  });

  it('fails visibly when an existing stream has incompatible configuration', async () => {
    const streams: OrderEventsStreamAdmin = {
      info: vi.fn().mockResolvedValue({
        config: { ...compatibleConfig(), storage: StorageType.Memory },
      }),
      add: vi.fn(),
    };

    await expect(ensureOrderEventsStream(streams)).rejects.toThrow(
      'configuration incompatible with the orders event contract'
    );
  });

  it('rejects streams with a lower message-size limit or finite message count', async () => {
    const streams: OrderEventsStreamAdmin = {
      info: vi.fn().mockResolvedValue({
        config: { ...compatibleConfig(), max_msgs: 10, max_msg_size: 1024 },
      }),
      add: vi.fn(),
    };

    await expect(ensureOrderEventsStream(streams)).rejects.toThrow(
      'configuration incompatible with the orders event contract'
    );
  });

  it('does not treat management API failures as a missing stream', async () => {
    const error = new Error('permission denied');
    const streams: OrderEventsStreamAdmin = {
      info: vi.fn().mockRejectedValue(error),
      add: vi.fn(),
    };

    await expect(ensureOrderEventsStream(streams)).rejects.toBe(error);
    expect(streams.add).not.toHaveBeenCalled();
  });
});
