/**
 * @typedef {import('./types.d.ts').IdentityAdapter} IdentityAdapter
 * @typedef {import('./types.d.ts').CanonicalUser} CanonicalUser
 * @typedef {import('./types.d.ts').VerifyTokenResult} VerifyTokenResult
 * @typedef {import('./types.d.ts').ExchangeResult} ExchangeResult
 */

import { AdapterError } from './AdapterError.js'

const VALID_TOKEN = 'valid-token'
const EXPIRED_TOKEN = 'expired-token'
const BLOCKED_TOKEN = 'blocked-token'

/**
 * Creates a mock user for testing.
 * @param {Partial<CanonicalUser>} [overrides]
 * @returns {CanonicalUser}
 */
export function createMockUser(overrides = {}) {
  return {
    userId: 'usr-001',
    email: 'test@example.com',
    emailVerified: true,
    displayName: 'Test User',
    avatarUrl: null,
    provider: 'mock',
    externalId: 'ext-001',
    ...overrides,
  }
}

/**
 * Mock implementation of IdentityAdapter for contract testing.
 *
 * Tokens:
 * - "valid-token" → success
 * - "expired-token" → TOKEN_EXPIRED error
 * - "blocked-token" → USER_BLOCKED error
 * - anything else → INVALID_TOKEN error
 *
 * External IDs:
 * - "ext-001" → returns mock user
 * - "ext-blocked" → USER_BLOCKED error
 * - anything else → USER_NOT_FOUND error
 *
 * @implements {IdentityAdapter}
 */
export class MockAdapter {
  /** @type {import('./types.d.ts').IdentityProviderType} */
  get provider() {
    return /** @type {import('./types.d.ts').IdentityProviderType} */ ('mock')
  }

  /**
   * @param {string} token
   * @returns {Promise<VerifyTokenResult>}
   */
  async verifyExternalToken(token) {
    if (token === EXPIRED_TOKEN) {
      throw AdapterError.tokenExpired('Token has expired')
    }
    if (token === BLOCKED_TOKEN) {
      throw AdapterError.userBlocked('User is blocked')
    }
    if (token !== VALID_TOKEN) {
      throw AdapterError.invalidToken('Invalid token')
    }

    return {
      valid: true,
      user: createMockUser(),
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    }
  }

  /**
   * @param {string} codeOrToken
   * @returns {Promise<ExchangeResult>}
   */
  async exchangeCodeOrToken(codeOrToken) {
    if (codeOrToken === EXPIRED_TOKEN) {
      throw AdapterError.tokenExpired('Token has expired')
    }
    if (codeOrToken === BLOCKED_TOKEN) {
      throw AdapterError.userBlocked('User is blocked')
    }
    if (codeOrToken !== VALID_TOKEN) {
      throw AdapterError.invalidToken('Invalid code or token')
    }

    return {
      user: createMockUser(),
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    }
  }

  /**
   * @param {string} externalId
   * @returns {Promise<CanonicalUser>}
   */
  async getProviderUser(externalId) {
    if (externalId === 'ext-blocked') {
      throw AdapterError.userBlocked('User is blocked in provider')
    }
    if (externalId !== 'ext-001') {
      throw AdapterError.userNotFound(`User ${externalId} not found`)
    }

    return createMockUser({ externalId })
  }

  /**
   * @param {string} externalId
   * @returns {Promise<void>}
   */
  async revokeProviderSession(externalId) {
    if (externalId === 'ext-blocked') {
      throw AdapterError.userBlocked('User is blocked in provider')
    }
    if (externalId !== 'ext-001') {
      throw AdapterError.userNotFound(`User ${externalId} not found`)
    }
  }
}
