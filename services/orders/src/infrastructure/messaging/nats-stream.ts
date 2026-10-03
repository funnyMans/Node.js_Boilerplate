import {
  DiscardPolicy,
  nanos,
  NatsError,
  RetentionPolicy,
  StorageType,
  type StreamConfig,
} from 'nats';
import type { StreamInfo } from 'nats';

export const ORDER_EVENTS_STREAM = 'ORDERS';
export const ORDER_EVENTS_SUBJECT = 'orders.order.created';
export const ORDER_EVENTS_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const ORDER_EVENTS_MAX_BYTES = 1024 * 1024 * 1024;
export const ORDER_EVENTS_DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

export const orderEventsStreamConfig: Partial<StreamConfig> = {
  name: ORDER_EVENTS_STREAM,
  description: 'Persisted order-created events published from the orders outbox',
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

export type OrdersStreamConfig = Pick<
  StreamInfo['config'],
  | 'subjects'
  | 'retention'
  | 'storage'
  | 'num_replicas'
  | 'max_age'
  | 'max_bytes'
  | 'max_msgs'
  | 'max_msg_size'
  | 'discard'
  | 'duplicate_window'
>;

export type OrderEventsStreamAdmin = {
  info: (stream: string) => Promise<{ config: OrdersStreamConfig }>;
  add: (config: Partial<StreamConfig>) => Promise<unknown>;
};

export async function ensureOrderEventsStream(streams: OrderEventsStreamAdmin): Promise<void> {
  try {
    const existing = await streams.info(ORDER_EVENTS_STREAM);
    assertCompatibleStream(existing.config);
  } catch (error) {
    if (!isStreamNotFound(error)) throw error;

    await streams.add(orderEventsStreamConfig);
    const created = await streams.info(ORDER_EVENTS_STREAM);
    assertCompatibleStream(created.config);
  }
}

function assertCompatibleStream(config: OrdersStreamConfig): void {
  const compatible =
    config.subjects.length === 1 &&
    config.subjects[0] === ORDER_EVENTS_SUBJECT &&
    config.retention === RetentionPolicy.Limits &&
    config.storage === StorageType.File &&
    config.num_replicas === 1 &&
    config.max_age === nanos(ORDER_EVENTS_RETENTION_MS) &&
    config.max_bytes === ORDER_EVENTS_MAX_BYTES &&
    config.max_msgs === -1 &&
    config.max_msg_size === 1024 * 1024 &&
    config.discard === DiscardPolicy.New &&
    config.duplicate_window === nanos(ORDER_EVENTS_DUPLICATE_WINDOW_MS);

  if (!compatible) {
    throw new Error(
      `NATS stream ${ORDER_EVENTS_STREAM} exists with configuration incompatible with the orders event contract`
    );
  }
}

function isStreamNotFound(error: unknown): boolean {
  return error instanceof NatsError && error.api_error?.err_code === 10059;
}
