import { LitElement, html, css } from 'lit'

/**
 * Permission gate that conditionally renders its children.
 * Shows slotted content only when the user has the required permission/role.
 *
 * @element captain-permission-gate
 * @attr {string} permission - Required permission (e.g., 'files.write')
 * @attr {string} role - Required role (alternative to permission)
 * @attr {boolean} hide-fallback - If true, shows nothing when unauthorized (default: true)
 *
 * @slot - Content to show when authorized
 * @slot unauthorized - Content to show when not authorized (only if hide-fallback is false)
 */
export class CaptainPermissionGate extends LitElement {
  static properties = {
    permission: { type: String },
    role: { type: String },
    hideFallback: { type: Boolean, attribute: 'hide-fallback' },
    _authorized: { type: Boolean, state: true },
    _checking: { type: Boolean, state: true },
  }

  static styles = css`
    :host {
      display: contents;
    }

    .hidden {
      display: none;
    }
  `

  constructor() {
    super()
    this.permission = ''
    this.role = ''
    this.hideFallback = true
    this._authorized = false
    this._checking = true
    this._unsubscribe = null
  }

  connectedCallback() {
    super.connectedCallback()
    this._subscribeToAuth()
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    if (this._unsubscribe) this._unsubscribe()
  }

  _subscribeToAuth() {
    try {
      const { GeniovaAuth } = /** @type {any} */ (
        /** @type {*} */ (globalThis).__captainAuth ?? {}
      )
      const auth = GeniovaAuth?.getInstance?.()
      if (auth) {
        this._unsubscribe = auth.onAuthStateChanged(() => {
          this._checkAccess()
        })
      } else {
        this._checking = false
      }
    } catch {
      this._checking = false
    }
  }

  async _checkAccess() {
    this._checking = true

    try {
      const { GeniovaAuth } = /** @type {any} */ (
        /** @type {*} */ (globalThis).__captainAuth ?? {}
      )
      const auth = GeniovaAuth?.getInstance?.()
      if (!auth) {
        this._authorized = false
        this._checking = false
        return
      }

      const user = auth.getUser()
      if (!user) {
        this._authorized = false
        this._checking = false
        return
      }

      if (this.role) {
        const roles = await auth.getRoles()
        this._authorized = roles.includes(this.role)
      } else if (this.permission) {
        this._authorized = await auth.hasPermission(this.permission)
      } else {
        // No permission or role specified, show content if authenticated
        this._authorized = true
      }
    } catch {
      this._authorized = false
    } finally {
      this._checking = false
    }
  }

  updated(changed) {
    if (changed.has('permission') || changed.has('role')) {
      this._checkAccess()
    }
  }

  render() {
    if (this._checking) return null

    if (this._authorized) {
      return html`<slot></slot>`
    }

    if (!this.hideFallback) {
      return html`<slot name="unauthorized"></slot>`
    }

    return null
  }
}

customElements.define('captain-permission-gate', CaptainPermissionGate)
