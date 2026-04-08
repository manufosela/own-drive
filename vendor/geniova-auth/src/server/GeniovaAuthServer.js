/**
 * Server-side SDK for verifying geniova-auth JWT sessions.
 * Zero Firebase dependency — only uses jose for JWT verification.
 *
 * Usage:
 *   import { GeniovaAuthServer } from '@geniova/auth/server'
 *
 *   const auth = GeniovaAuthServer.init({
 *     appId: 'my-app',
 *     jwksUrl: 'https://auth.geniova.com/.well-known/jwks.json',
 *   })
 *
 *   const user = await auth.verifyToken(jwt)
 *
 * @module server/GeniovaAuthServer
 */

import { createRemoteJWKSet, jwtVerify, importSPKI } from 'jose'

const JWKS_CACHE_TTL = 6 * 60 * 60 * 1000 // 6 hours

/**
 * @typedef {object} ServerConfig
 * @property {string} appId - Application ID (used as JWT audience)
 * @property {string} [jwksUrl] - URL to fetch JWKS (default: https://auth.geniova.com/.well-known/jwks.json)
 * @property {string} [publicKey] - PEM-encoded public key (alternative to jwksUrl)
 * @property {string} [issuer] - Expected JWT issuer (default: 'geniova-auth')
 */

/**
 * @typedef {object} SessionUser
 * @property {string} uid - User ID
 * @property {string} email - User email
 * @property {string|null} displayName - Display name
 * @property {string|null} photoURL - Photo URL
 * @property {string|null} provider - Auth provider
 * @property {string[]} roles - User roles for this app
 * @property {string} appId - Application ID
 * @property {string} jti - Token ID
 * @property {number} iat - Issued at timestamp
 * @property {number} exp - Expiration timestamp
 */

export class GeniovaAuthServer {
  /** @type {string} */
  #appId

  /** @type {string} */
  #issuer

  /** @type {string|null} */
  #jwksUrl

  /** @type {string|null} */
  #publicKeyPem

  /** @type {import('jose').FlattenedJWSInput|null} */
  #jwks = null

  /** @type {import('jose').KeyLike|null} */
  #publicKeyObject = null

  /**
   * @param {ServerConfig} config
   */
  constructor(config) {
    if (!config.appId) {
      throw new Error('appId is required')
    }

    if (!config.jwksUrl && !config.publicKey) {
      throw new Error('Either jwksUrl or publicKey is required')
    }

    this.#appId = config.appId
    this.#issuer = config.issuer ?? 'geniova-auth'
    this.#jwksUrl = config.jwksUrl ?? null
    this.#publicKeyPem = config.publicKey ?? null
  }

  /**
   * Factory method to create a new instance.
   * @param {ServerConfig} config
   * @returns {GeniovaAuthServer}
   */
  static init(config) {
    return new GeniovaAuthServer(config)
  }

  /**
   * Verifies a JWT session token and returns the user payload.
   * Returns null if the token is invalid, expired, or has wrong audience.
   *
   * @param {string} token - JWT session token
   * @returns {Promise<SessionUser|null>}
   */
  async verifyToken(token) {
    if (!token || typeof token !== 'string') {
      return null
    }

    try {
      const key = await this.#getVerificationKey()

      const { payload } = await jwtVerify(token, key, {
        issuer: this.#issuer,
        audience: this.#appId,
      })

      return /** @type {SessionUser} */ ({
        uid: payload.uid,
        email: payload.email,
        displayName: payload.displayName ?? null,
        photoURL: payload.photoURL ?? null,
        provider: payload.provider ?? null,
        roles: payload.roles ?? [],
        appId: payload.appId ?? this.#appId,
        jti: payload.jti,
        iat: payload.iat,
        exp: payload.exp,
      })
    } catch {
      return null
    }
  }

  /**
   * Gets the verification key (JWKS or static public key).
   * @returns {Promise<import('jose').KeyLike | import('jose').GetKeyFunction<import('jose').JWSHeaderParameters, import('jose').FlattenedJWSInput>>}
   */
  async #getVerificationKey() {
    if (this.#publicKeyPem) {
      if (!this.#publicKeyObject) {
        this.#publicKeyObject = await importSPKI(this.#publicKeyPem, 'RS256')
      }
      return this.#publicKeyObject
    }

    if (!this.#jwks) {
      this.#jwks = createRemoteJWKSet(new URL(this.#jwksUrl), {
        cacheMaxAge: JWKS_CACHE_TTL,
      })
    }

    return this.#jwks
  }

  /**
   * Clears the cached JWKS/public key (for testing or key rotation).
   */
  clearCache() {
    this.#jwks = null
    this.#publicKeyObject = null
  }

  /**
   * Returns the configured appId.
   * @returns {string}
   */
  get appId() {
    return this.#appId
  }
}
