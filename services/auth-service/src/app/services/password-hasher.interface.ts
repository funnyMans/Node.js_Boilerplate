export interface PasswordHasher {
  hash(value: string): Promise<string>;
  verify(value: string, digest: string): Promise<boolean>;
  randomToken(): string;
}
