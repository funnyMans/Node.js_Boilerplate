# @app/contracts

Shared TypeScript DTOs and event contracts for service boundaries.

`eventTypes` is the registry of supported domain-event names.
`createDomainEvent` derives the payload type and event-name literal from that
registry, so an event cannot be created with a known name and an unrelated
payload at compile time:

```ts
const event = createDomainEvent({
  eventType: eventTypes.userCreated,
  sourceService: 'users-service',
  correlationId: 'request-123',
  payload: {
    userId: 'user-123',
    email: 'learner@example.com',
    status: 'active',
  },
});
```

These TypeScript contracts are not runtime validation. Validate untrusted HTTP
and broker payloads at the receiving boundary before treating them as these
types. Event names include a schema version (`*.v1`); keep the envelope's
`version` field consistent with that event contract when introducing another
version.
