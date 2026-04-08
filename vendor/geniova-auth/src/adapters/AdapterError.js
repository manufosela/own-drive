/**
 * @typedef {import('./types.d.ts').AdapterErrorCode} AdapterErrorCode
 */

/**
 * Error thrown by IdentityAdapter operations.
 * Provides a standard error format across all adapter implementations.
 */
export class AdapterError extends Error {
  /**
   * @param {AdapterErrorCode} code
   * @param {string} message
   * @param {number} httpStatus
   * @param {unknown} [cause]
   */
  constructor(code, message, httpStatus, cause) {
    super(message)
    this.name = 'AdapterError'
    /** @type {AdapterErrorCode} */
    this.code = code
    /** @type {number} */
    this.httpStatus = httpStatus
    /** @type {unknown} */
    this.cause = cause
  }

  /**
   * @param {string} message
   * @param {unknown} [cause]
   * @returns {AdapterError}
   */
  static invalidToken(message, cause) {
    return new AdapterError('INVALID_TOKEN', message, 401, cause)
  }

  /**
   * @param {string} message
   * @param {unknown} [cause]
   * @returns {AdapterError}
   */
  static tokenExpired(message, cause) {
    return new AdapterError('TOKEN_EXPIRED', message, 401, cause)
  }

  /**
   * @param {string} message
   * @param {unknown} [cause]
   * @returns {AdapterError}
   */
  static userNotFound(message, cause) {
    return new AdapterError('USER_NOT_FOUND', message, 404, cause)
  }

  /**
   * @param {string} message
   * @param {unknown} [cause]
   * @returns {AdapterError}
   */
  static userBlocked(message, cause) {
    return new AdapterError('USER_BLOCKED', message, 403, cause)
  }

  /**
   * @param {string} message
   * @param {unknown} [cause]
   * @returns {AdapterError}
   */
  static providerError(message, cause) {
    return new AdapterError('PROVIDER_ERROR', message, 502, cause)
  }

  /**
   * @param {string} message
   * @param {unknown} [cause]
   * @returns {AdapterError}
   */
  static networkError(message, cause) {
    return new AdapterError('NETWORK_ERROR', message, 502, cause)
  }

  /**
   * @param {string} message
   * @param {unknown} [cause]
   * @returns {AdapterError}
   */
  static configurationError(message, cause) {
    return new AdapterError('CONFIGURATION_ERROR', message, 500, cause)
  }
}
