import { LitElement, html, css } from 'lit'

/**
 * User menu component showing avatar, name, and logout action.
 * Subscribes to auth state changes automatically.
 *
 * @element captain-user-menu
 * @attr {string} primary-color - Primary brand color (default: #667eea)
 *
 * @fires captain-logout - When user clicks logout
 */
export class CaptainUserMenu extends LitElement {
  static properties = {
    primaryColor: { type: String, attribute: 'primary-color' },
    _user: { type: Object, state: true },
    _open: { type: Boolean, state: true },
  }

  static styles = css`
    :host {
      display: inline-block;
      position: relative;
      font-family: system-ui, -apple-system, sans-serif;
    }

    .trigger {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.375rem 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 9999px;
      background: #fff;
      cursor: pointer;
      font-size: 0.9rem;
      color: #2d3748;
    }

    .trigger:hover {
      background: #f7fafc;
    }

    .avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      object-fit: cover;
    }

    .avatar-placeholder {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--captain-primary, #667eea);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 0.85rem;
    }

    .dropdown {
      position: absolute;
      top: calc(100% + 4px);
      right: 0;
      min-width: 200px;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      z-index: 50;
      overflow: hidden;
    }

    .dropdown[hidden] {
      display: none;
    }

    .user-info {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #e2e8f0;
    }

    .user-info .name {
      font-weight: 600;
      color: #1a202c;
      font-size: 0.9rem;
    }

    .user-info .email {
      color: #718096;
      font-size: 0.8rem;
      margin-top: 0.125rem;
    }

    .menu-item {
      display: block;
      width: 100%;
      padding: 0.625rem 1rem;
      border: none;
      background: none;
      text-align: left;
      font-size: 0.9rem;
      color: #4a5568;
      cursor: pointer;
    }

    .menu-item:hover {
      background: #f7fafc;
    }

    .menu-item.logout {
      color: #e53e3e;
      border-top: 1px solid #e2e8f0;
    }
  `

  constructor() {
    super()
    this.primaryColor = '#667eea'
    this._user = null
    this._open = false
    this._unsubscribe = null
    this._boundClose = this._handleOutsideClick.bind(this)
  }

  connectedCallback() {
    super.connectedCallback()
    this._subscribeToAuth()
    document.addEventListener('click', this._boundClose)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    if (this._unsubscribe) this._unsubscribe()
    document.removeEventListener('click', this._boundClose)
  }

  _subscribeToAuth() {
    try {
      const { GeniovaAuth } = /** @type {any} */ (
        /** @type {*} */ (globalThis).__captainAuth ?? {}
      )
      const auth = GeniovaAuth?.getInstance?.()
      if (auth) {
        this._unsubscribe = auth.onAuthStateChanged((user) => {
          this._user = user
        })
      }
    } catch {
      // Auth not initialized yet
    }
  }

  _handleOutsideClick(e) {
    if (!this.contains(e.composedPath()[0])) {
      this._open = false
    }
  }

  _toggleDropdown(e) {
    e.stopPropagation()
    this._open = !this._open
  }

  async _logout() {
    this._open = false
    try {
      const { GeniovaAuth } = /** @type {any} */ (
        /** @type {*} */ (globalThis).__captainAuth ?? {}
      )
      const auth = GeniovaAuth?.getInstance?.()
      if (auth) await auth.logout()
    } catch {
      // Ignore logout errors
    }
    this.dispatchEvent(new CustomEvent('captain-logout', {
      bubbles: true,
      composed: true,
    }))
  }

  _getInitials(name) {
    if (!name) return '?'
    return name
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase()
  }

  render() {
    if (!this._user) return null

    return html`
      <div style="--captain-primary: ${this.primaryColor}">
        <button class="trigger" @click=${this._toggleDropdown}>
          ${this._user.photoURL
            ? html`<img class="avatar" src=${this._user.photoURL} alt="" />`
            : html`<span class="avatar-placeholder">${this._getInitials(this._user.displayName)}</span>`}
          <span>${this._user.displayName ?? this._user.email}</span>
        </button>

        <div class="dropdown" ?hidden=${!this._open}>
          <div class="user-info">
            <div class="name">${this._user.displayName}</div>
            <div class="email">${this._user.email}</div>
          </div>
          <button class="menu-item logout" @click=${this._logout}>
            Cerrar sesion
          </button>
        </div>
      </div>
    `
  }
}

customElements.define('captain-user-menu', CaptainUserMenu)
