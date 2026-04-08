/**
 * @typedef {import('./types.d.ts').GeniovaAuthConfig} GeniovaAuthConfig
 */

import { CaptainAuthCore } from './core/CaptainAuthCore.js'

/**
 * Backward-compatible alias for CaptainAuthCore.
 * Apps using GeniovaAuth continue to work without changes.
 *
 * @extends {CaptainAuthCore}
 */
export class GeniovaAuth extends CaptainAuthCore {
  /**
   * @param {GeniovaAuthConfig} config
   * @returns {GeniovaAuth}
   */
  static init(config) {
    if (!config.appId) {
      throw new Error('GeniovaAuth: appId es requerido')
    }
    if (!config.firebaseConfig) {
      throw new Error('GeniovaAuth: firebaseConfig es requerido')
    }

    return /** @type {GeniovaAuth} */ (super.init(config))
  }

  /**
   * @returns {GeniovaAuth}
   */
  static getInstance() {
    try {
      return /** @type {GeniovaAuth} */ (super.getInstance())
    } catch {
      throw new Error('GeniovaAuth: Debes llamar a init() primero')
    }
  }
}

export { CaptainAuthCore }
