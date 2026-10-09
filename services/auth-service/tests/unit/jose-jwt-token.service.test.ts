import { describe, expect, it } from 'vitest';
import { JoseJwtTokenService } from '../../src/infrastructure/security/jose-jwt-token.service';

const roleGrants = [
  { role: 'chief_supervisor' as const },
  { role: 'area_supervisor' as const, area: 'la' as const },
];

describe('JoseJwtTokenService', () => {
  it('issues signed JWT access and refresh tokens with distinct verification keys', async () => {
    const tokens = new JoseJwtTokenService(
      'access-secret-for-tms-study-tests-32',
      'refresh-secret-for-tms-study-tests-32'
    );
    const expiresAt = new Date(Date.now() + 60_000);
    const accessToken = await tokens.issueAccessToken({
      userId: 'person-1',
      roleGrants,
      expiresAt,
    });
    const refreshToken = await tokens.issueRefreshToken({ userId: 'person-1', expiresAt });

    expect(accessToken.split('.')).toHaveLength(3);
    expect(refreshToken.split('.')).toHaveLength(3);
    await expect(tokens.verifyAccessToken(accessToken)).resolves.toEqual({ userId: 'person-1' });
    await expect(tokens.verifyRefreshToken(refreshToken)).resolves.toEqual({
      userId: 'person-1',
    });
    await expect(tokens.verifyAccessToken(refreshToken)).resolves.toBeNull();
    await expect(tokens.verifyRefreshToken(accessToken)).resolves.toBeNull();
  });

  it('rejects expired tokens and tokens signed with another secret', async () => {
    const tokens = new JoseJwtTokenService(
      'access-secret-for-tms-study-tests-32',
      'refresh-secret-for-tms-study-tests-32'
    );
    const expiresAt = new Date(Date.now() - 1_000);
    const expiredAccess = await tokens.issueAccessToken({
      userId: 'person-1',
      roleGrants,
      expiresAt,
    });
    const otherSigner = new JoseJwtTokenService(
      'another-access-secret-for-tms-tests-32',
      'another-refresh-secret-for-tms-tests-32'
    );
    const validAccess = await otherSigner.issueAccessToken({
      userId: 'person-1',
      roleGrants,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(tokens.verifyAccessToken(expiredAccess)).resolves.toBeNull();
    await expect(tokens.verifyAccessToken(validAccess)).resolves.toBeNull();
  });
});
