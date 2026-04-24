export type AccessTokenPayload = {
  email: string;
  permissions: string[];
  roles: string[];
  userId: string;
};

export type RefreshTokenPayload = {
  familyId: string;
  sessionId: string;
  userId: string;
};

export interface TokenService {
  issueAccessToken(payload: AccessTokenPayload): Promise<string>;
  issueRefreshToken(payload: RefreshTokenPayload): Promise<string>;
  verifyAccessToken(token: string): Promise<AccessTokenPayload>;
  verifyRefreshToken(token: string): Promise<RefreshTokenPayload>;
}
