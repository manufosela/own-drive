/**
 * @typedef {import('./types.d.ts').IdentityAdapter} IdentityAdapter
 * @typedef {import('./types.d.ts').CanonicalUser} CanonicalUser
 * @typedef {import('./types.d.ts').VerifyTokenResult} VerifyTokenResult
 * @typedef {import('./types.d.ts').ExchangeResult} ExchangeResult
 * @typedef {import('./types.d.ts').AdapterConfig} AdapterConfig
 */

import * as jose from 'jose'
import { AdapterError } from './AdapterError.js'

const DESCOPE_BASE_URL = 'https://api.descope.com'

/**
 * IdentityAdapter implementation for Descope.
 *
 * Verifies tokens using JWKS, exchanges auth codes via Descope REST API,
 * retrieves users via Management API, and revokes sessions.
 *
 * @implements {IdentityAdapter}
 */
export class DescopeAdapter {
  /** @type {'descope'} */
  provider = 'descope'

  /** @type {string} */
  #projectId

  /** @type {string} */
  #managementKey

  /** @type {jose.FlattenedJWSInput | jose.GetKeyFunction<jose.JWSHeaderParameters, jose.FlattenedJWSInput>} */
  #jwks

  /** @type {string} */
  #baseUrl

  /** @type {typeof globalThis.fetch} */
  #fetch

  /**
   * @param {object} config
   * @param {string} config.projectId - Descope project ID
   * @param {string} config.managementKey - Descope management key
   * @param {string} [config.baseUrl] - Override base URL (for testing)
   * @param {typeof globalThis.fetch} [config.fetch] - Override fetch (for testing)
   * @param {*} [config.jwks] - Override JWKS key set (for testing)
   */
  constructor(config) {
    if (!config.projectId) {
      throw AdapterError.configurationError('Descope projectId is required')
    }
    if (!config.managementKey) {
      throw AdapterError.configurationError('Descope managementKey is required')
    }

    this.#projectId = config.projectId
    this.#managementKey = config.managementKey
    this.#baseUrl = config.baseUrl ?? DESCOPE_BASE_URL
    this.#fetch = config.fetch ?? globalThis.fetch

    this.#jwks = config.jwks ?? jose.createRemoteJWKSet(
      new URL(`${this.#baseUrl}/${this.#projectId}/.well-known/jwks.json`)
    )
  }

  /**
   * Verify a Descope session JWT using JWKS.
   *
   * @param {string} token - Descope session JWT
   * @returns {Promise<VerifyTokenResult>}
   */
  async verifyExternalToken(token) {
    try {
      const { payload } = await jose.jwtVerify(token, this.#jwks, {
        issuer: `${this.#baseUrl}/${this.#projectId}`,
        audience: this.#projectId,
      })

      const user = this.#payloadToCanonicalUser(payload)

      return {
        valid: true,
        user,
        expiresAt: payload.exp ?? null,
      }
    } catch (err) {
      if (err instanceof AdapterError) {
        throw err
      }
      if (err instanceof jose.errors.JWTExpired) {
        throw AdapterError.tokenExpired('Descope token has expired', err)
      }
      // All jose verification/parsing errors → INVALID_TOKEN
      if (err?.code?.startsWith?.('ERR_J')) {
        throw AdapterError.invalidToken('Invalid Descope token', err)
      }
      throw AdapterError.providerError('Failed to verify Descope token', err)
    }
  }

  /**
   * Exchange a Descope authorization code for session tokens.
   *
   * @param {string} codeOrToken - Authorization code from Descope OAuth flow
   * @returns {Promise<ExchangeResult>}
   */
  async exchangeCodeOrToken(codeOrToken) {
    const res = await this.#apiCall('POST', '/api/oauth/exchange-code', {
      code: codeOrToken,
    }, this.#projectId)

    if (!res.ok) {
      const body = await this.#safeJson(res)
      const message = body?.errorDescription ?? body?.message ?? 'Exchange failed'

      if (res.status === 401 || res.status === 400) {
        throw AdapterError.invalidToken(message)
      }
      if (res.status === 403) {
        throw AdapterError.userBlocked(message)
      }
      throw AdapterError.providerError(`Descope exchange error: ${message}`)
    }

    const data = await res.json()

    if (!data.sessionJwt) {
      throw AdapterError.providerError('Descope exchange response missing sessionJwt')
    }

    // Decode session JWT to extract user claims (already verified by Descope)
    const payload = jose.decodeJwt(data.sessionJwt)
    const user = this.#payloadToCanonicalUser(payload)

    return {
      user,
      accessToken: data.sessionJwt,
      refreshToken: data.refreshJwt ?? null,
      expiresAt: payload.exp ?? Math.floor(Date.now() / 1000) + 3600,
    }
  }

  /**
   * Retrieve a user from Descope by their user ID.
   *
   * @param {string} externalId - Descope user ID
   * @returns {Promise<CanonicalUser>}
   */
  async getProviderUser(externalId) {
    const res = await this.#apiCall(
      'GET',
      `/api/management/users/load-user?userId=${encodeURIComponent(externalId)}`,
      null,
      `${this.#projectId}:${this.#managementKey}`
    )

    if (!res.ok) {
      const body = await this.#safeJson(res)
      const message = body?.errorDescription ?? body?.message ?? 'User lookup failed'

      if (res.status === 404) {
        throw AdapterError.userNotFound(`Descope user not found: ${externalId}`)
      }
      if (res.status === 403) {
        throw AdapterError.userBlocked(message)
      }
      throw AdapterError.providerError(`Descope user lookup error: ${message}`)
    }

    const data = await res.json()
    const u = data.user

    if (!u) {
      throw AdapterError.userNotFound(`Descope user not found: ${externalId}`)
    }

    if (u.status === 'disabled') {
      throw AdapterError.userBlocked(`Descope user is disabled: ${externalId}`)
    }

    return {
      userId: u.userId,
      email: u.email ?? '',
      emailVerified: u.verifiedEmail ?? false,
      displayName: u.name ?? null,
      avatarUrl: u.picture ?? null,
      provider: 'descope',
      externalId: u.userId,
      raw: { source: 'descope', descopeUser: u },
    }
  }

  /**
   * Revoke all sessions for a Descope user.
   *
   * @param {string} externalId - Descope user ID
   * @returns {Promise<void>}
   */
  async revokeProviderSession(externalId) {
    const res = await this.#apiCall(
      'POST',
      '/api/management/users/logout-all-user-devices',
      { userId: externalId },
      `${this.#projectId}:${this.#managementKey}`
    )

    if (!res.ok) {
      const body = await this.#safeJson(res)
      const message = body?.errorDescription ?? body?.message ?? 'Revoke failed'

      if (res.status === 404) {
        throw AdapterError.userNotFound(`Descope user not found: ${externalId}`)
      }
      throw AdapterError.providerError(`Descope revoke error: ${message}`)
    }
  }

  // --- Private helpers ---

  /**
   * Make an API call to Descope.
   *
   * @param {string} method
   * @param {string} path
   * @param {object | null} body
   * @param {string} bearerToken
   * @returns {Promise<Response>}
   */
  async #apiCall(method, path, body, bearerToken) {
    const url = `${this.#baseUrl}${path}`
    /** @type {RequestInit} */
    const init = {
      method,
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
    }

    if (body && method !== 'GET') {
      init.body = JSON.stringify(body)
    }

    try {
      return await this.#fetch(url, init)
    } catch (err) {
      throw AdapterError.networkError(`Descope API unreachable: ${path}`, err)
    }
  }

  /**
   * Safely parse JSON from a response, returning null on failure.
   *
   * @param {Response} res
   * @returns {Promise<Record<string, unknown> | null>}
   */
  async #safeJson(res) {
    try {
      return await res.json()
    } catch {
      return null
    }
  }

  /**
   * Convert a Descope JWT payload to a CanonicalUser.
   *
   * @param {jose.JWTPayload} payload
   * @returns {CanonicalUser}
   */
  #payloadToCanonicalUser(payload) {
    const sub = payload.sub
    if (!sub) {
      throw AdapterError.invalidToken('Descope token missing sub claim')
    }

    const email = /** @type {string} */ (payload.email ?? payload['emails']?.[0] ?? '')
    if (!email) {
      throw AdapterError.invalidToken('Descope token missing email claim')
    }

    return {
      userId: sub,
      email,
      emailVerified: !!payload['email_verified'],
      displayName: /** @type {string | null} */ (payload.name ?? null),
      avatarUrl: /** @type {string | null} */ (payload.picture ?? null),
      provider: 'descope',
      externalId: sub,
      raw: { source: 'descope', claims: { ...payload } },
    }
  }
}
