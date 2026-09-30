export const userStatuses = ['active', 'blocked', 'deleted'] as const;

export type UserStatus = (typeof userStatuses)[number];

export class User {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly firstName: string | null,
    public readonly lastName: string | null,
    public readonly isActive: boolean,
    public readonly status: UserStatus,
    public readonly deletedAt: Date | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {}

  static create(input: {
    id?: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    isActive?: boolean;
    status?: UserStatus;
    deletedAt?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
  }): User {
    return new User(
      input.id ?? crypto.randomUUID(),
      input.email,
      input.firstName ?? null,
      input.lastName ?? null,
      input.isActive ?? true,
      input.status ?? 'active',
      input.deletedAt ?? null,
      input.createdAt ?? new Date(),
      input.updatedAt ?? new Date()
    );
  }

  markBlocked(): User {
    return new User(
      this.id,
      this.email,
      this.firstName,
      this.lastName,
      false,
      'blocked',
      this.deletedAt,
      this.createdAt,
      new Date()
    );
  }

  markDeleted(): User {
    return new User(
      this.id,
      this.email,
      this.firstName,
      this.lastName,
      false,
      'deleted',
      new Date(),
      this.createdAt,
      new Date()
    );
  }
}

export type UserFilters = {
  email?: string;
  isActive?: boolean;
  status?: UserStatus;
};
