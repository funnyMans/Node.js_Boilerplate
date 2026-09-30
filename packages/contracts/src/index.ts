export const userStatuses = ['active', 'blocked', 'deleted'] as const;

export type UserStatus = (typeof userStatuses)[number];

export type EventEnvelope<TPayload> = {
  eventId: string;
  eventType: string;
  sourceService: string;
  version: number;
  occurredAt: string;
  correlationId: string;
  causationId?: string;
  traceId?: string;
  retryable: boolean;
  payload: TPayload;
};

export function createDomainEvent<TPayload>(params: {
  eventType: string;
  sourceService: string;
  correlationId: string;
  payload: TPayload;
  causationId?: string;
  traceId?: string;
  retryable?: boolean;
  version?: number;
}): EventEnvelope<TPayload> {
  return {
    eventId: crypto.randomUUID(),
    eventType: params.eventType,
    sourceService: params.sourceService,
    version: params.version ?? 1,
    occurredAt: new Date().toISOString(),
    correlationId: params.correlationId,
    causationId: params.causationId,
    traceId: params.traceId,
    retryable: params.retryable ?? false,
    payload: params.payload,
  };
}

export type UserCreatedEvent = EventEnvelope<{
  userId: string;
  email: string;
  status: UserStatus;
}>;

export const orderStatuses = ['pending', 'confirmed', 'cancelled', 'fulfilled'] as const;
export type OrderStatus = (typeof orderStatuses)[number];

export type OrderItemDto = {
  productId: string;
  quantity: number;
};

export type CreateOrderRequest = {
  items: OrderItemDto[];
};

export type OrderDto = {
  id: string;
  userId: string;
  status: OrderStatus;
  items: OrderItemDto[];
  createdAt: string;
  updatedAt: string;
};

export type OrderCreatedEvent = EventEnvelope<{
  orderId: string;
  userId: string;
  items: OrderItemDto[];
}>;

export type SessionCreatedEvent = EventEnvelope<{
  sessionId: string;
  userId: string;
  role: AuthRole;
  expiresAt: string;
}>;

export type SessionRevokedEvent = EventEnvelope<{
  sessionId: string;
  userId: string;
  reason: 'logout' | 'refresh-reuse' | 'admin-revoked';
}>;

export type UserDto = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean;
  status: UserStatus;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateUserDto = {
  email: string;
  status?: UserStatus;
};

export type UpdateUserDto = Partial<{
  firstName: string;
  lastName: string;
  isActive: boolean;
  status: UserStatus;
}>;

export type AppErrorShape = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type AppResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: AppErrorShape;
    };

export type UserListResponse = {
  users: UserDto[];
};

export type UserCountResponse = {
  count: number;
};

export type UserNotFoundError = AppErrorShape & {
  code: 'USER_NOT_FOUND';
};

export type ValidationError = AppErrorShape & {
  code: 'VALIDATION_ERROR';
};

export type ForbiddenError = AppErrorShape & {
  code: 'FORBIDDEN';
};

export type RegisterAccountRequest = {
  email: string;
  password: string;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type AuthAccountResponse = {
  userId: string;
  email: string;
};

export const authRoles = ['user', 'admin'] as const;
export type AuthRole = (typeof authRoles)[number];

export type AuthTokenResponse = {
  accessToken: string;
  refreshToken: string;
  userId: string;
  role: AuthRole;
  expiresAt: string;
};

export type AuthSessionResponse = {
  valid: true;
  userId: string;
  role: AuthRole;
  expiresAt: string;
};

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'INVALID_SESSION'
  | 'AUTH_SERVICE_UNAVAILABLE'
  | 'CREDENTIALS_ALREADY_EXIST';

export type AuthErrorShape = AppErrorShape & {
  code: AuthErrorCode;
};

export const eventTypes = {
  userCreated: 'user.created.v1',
  orderCreated: 'order.created.v1',
  sessionCreated: 'session.created.v1',
  sessionRevoked: 'session.revoked.v1',
} as const;
