/**
 * Identity provider types supported by captain-auth adapters.
 */
export type IdentityProviderType = 'descope' | 'firebase' | 'auth0'

/**
 * Canonical user representation. Provider-agnostic identity
 * normalized by the adapter after authentication.
 */
export interface CanonicalUser {
  /** Unique user ID (deterministic UUIDv5 based on email) */
  userId: string
  /** User email address */
  email: string
  /** Whether the email has been verified by the provider */
  emailVerified: boolean
  /** Display name */
  displayName: string | null
  /** Avatar URL */
  avatarUrl: string | null
  /** Identity provider that authenticated the user */
  provider: string
  /** External user ID from the identity provider */
  externalId: string
  /** Raw provider-specific data (opaque to core) */
  raw?: Record<string, unknown>
}

/**
 * Result of verifying an external token from the identity provider.
 */
export interface VerifyTokenResult {
  /** Whether the token is valid */
  valid: boolean
  /** Canonical user data (present when valid=true) */
  user: CanonicalUser | null
  /** Token expiration timestamp in seconds (if available) */
  expiresAt: number | null
}

/**
 * Result of exchanging a code or token with the identity provider.
 */
export interface ExchangeResult {
  /** Canonical user data */
  user: CanonicalUser
  /** Access token from the provider (opaque string) */
  accessToken: string
  /** Refresh token from the provider (if available) */
  refreshToken: string | null
  /** Token expiration timestamp in seconds */
  expiresAt: number
}

/**
 * Standard error codes for adapter operations.
 */
export type AdapterErrorCode =
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'USER_NOT_FOUND'
  | 'USER_BLOCKED'
  | 'PROVIDER_ERROR'
  | 'NETWORK_ERROR'
  | 'CONFIGURATION_ERROR'

/**
 * Error thrown by adapter operations.
 */
export interface AdapterError {
  /** Machine-readable error code */
  code: AdapterErrorCode
  /** Human-readable error message */
  message: string
  /** HTTP status code hint (401, 403, 409, 500, 502) */
  httpStatus: number
  /** Original error from the provider (for debugging) */
  cause?: unknown
}

/**
 * Configuration passed to an adapter at initialization.
 */
export interface AdapterConfig {
  /** Provider type identifier */
  provider: IdentityProviderType
  /** Provider-specific configuration (projectId, flowId, etc.) */
  providerConfig: Record<string, unknown>
}

/**
 * IdentityAdapter interface. Every identity provider must implement
 * these methods to be compatible with captain-auth.
 *
 * Adapters handle authentication only. Authorization (roles, permissions,
 * user status) is resolved by captain-auth core, not the adapter.
 */
export interface IdentityAdapter {
  /** Provider type for this adapter */
  readonly provider: IdentityProviderType

  /**
   * Verify an external token issued by the identity provider.
   *
   * @param token - The token string to verify
   * @returns Verification result with canonical user data
   * @throws {AdapterError} with code INVALID_TOKEN (401), TOKEN_EXPIRED (401),
   *         PROVIDER_ERROR (502), or NETWORK_ERROR (502)
   */
  verifyExternalToken(token: string): Promise<VerifyTokenResult>

  /**
   * Exchange an authorization code or token for user data and tokens.
   * Used during the login flow to obtain canonical user identity.
   *
   * @param codeOrToken - Authorization code or token from the provider
   * @returns Exchange result with canonical user, access token and expiration
   * @throws {AdapterError} with code INVALID_TOKEN (401), USER_NOT_FOUND (404),
   *         USER_BLOCKED (403), PROVIDER_ERROR (502), or NETWORK_ERROR (502)
   */
  exchangeCodeOrToken(codeOrToken: string): Promise<ExchangeResult>

  /**
   * Retrieve user data from the identity provider by external ID.
   *
   * @param externalId - The user's ID in the identity provider
   * @returns Canonical user data
   * @throws {AdapterError} with code USER_NOT_FOUND (404),
   *         PROVIDER_ERROR (502), or NETWORK_ERROR (502)
   */
  getProviderUser(externalId: string): Promise<CanonicalUser>

  /**
   * Revoke the user's session in the identity provider.
   * Called during logout to ensure the provider session is also invalidated.
   *
   * @param externalId - The user's ID in the identity provider
   * @throws {AdapterError} with code USER_NOT_FOUND (404),
   *         PROVIDER_ERROR (502), or NETWORK_ERROR (502)
   */
  revokeProviderSession(externalId: string): Promise<void>
}
