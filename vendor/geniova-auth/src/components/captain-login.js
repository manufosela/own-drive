import { LitElement, html, css } from 'lit'

/**
 * Login component that renders provider buttons and email/password form.
 * Uses GeniovaAuth singleton internally.
 *
 * @element captain-login
 * @attr {string} app-id - Application ID (required)
 * @attr {string} providers - Comma-separated list of enabled providers (default: "microsoft,email")
 * @attr {string} brand-name - Brand name displayed in header
 * @attr {string} brand-logo - URL of brand logo
 * @attr {string} primary-color - Primary brand color (default: #667eea)
 *
 * @fires captain-login-success - When login succeeds, detail: { user }
 * @fires captain-login-error - When login fails, detail: { error }
 */
export class CaptainLogin extends LitElement {
  static properties = {
    appId: { type: String, attribute: 'app-id' },
    providers: { type: String },
    brandName: { type: String, attribute: 'brand-name' },
    brandLogo: { type: String, attribute: 'brand-logo' },
    primaryColor: { type: String, attribute: 'primary-color' },
    _loading: { type: Boolean, state: true },
    _error: { type: String, state: true },
    _showEmailForm: { type: Boolean, state: true },
  }

  static styles = css`
    :host {
      display: block;
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 400px;
      margin: 0 auto;
    }

    .container {
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 2rem;
      background: #fff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .header {
      text-align: center;
      margin-bottom: 1.5rem;
    }

    .header img {
      max-height: 48px;
      margin-bottom: 0.5rem;
    }

    .header h2 {
      margin: 0;
      font-size: 1.25rem;
      color: #1a202c;
    }

    .provider-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.75rem 1rem;
      margin-bottom: 0.5rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #fff;
      font-size: 0.95rem;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }

    .provider-btn:hover {
      background: #f7fafc;
      border-color: #cbd5e0;
    }

    .provider-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .divider {
      display: flex;
      align-items: center;
      margin: 1rem 0;
      color: #a0aec0;
      font-size: 0.85rem;
    }

    .divider::before,
    .divider::after {
      content: '';
      flex: 1;
      border-bottom: 1px solid #e2e8f0;
    }

    .divider span {
      padding: 0 0.75rem;
    }

    .form-group {
      margin-bottom: 0.75rem;
    }

    .form-group label {
      display: block;
      font-size: 0.85rem;
      font-weight: 500;
      color: #4a5568;
      margin-bottom: 0.25rem;
    }

    .form-group input {
      width: 100%;
      padding: 0.625rem 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 0.95rem;
      box-sizing: border-box;
    }

    .form-group input:focus {
      outline: none;
      border-color: var(--captain-primary, #667eea);
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
    }

    .submit-btn {
      width: 100%;
      padding: 0.75rem;
      border: none;
      border-radius: 8px;
      background: var(--captain-primary, #667eea);
      color: #fff;
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
      margin-top: 0.5rem;
    }

    .submit-btn:hover {
      opacity: 0.9;
    }

    .submit-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .error {
      background: #fff5f5;
      color: #c53030;
      padding: 0.75rem;
      border-radius: 8px;
      font-size: 0.85rem;
      margin-bottom: 1rem;
    }

    .loading {
      text-align: center;
      padding: 1rem;
      color: #718096;
    }
  `

  constructor() {
    super()
    this.providers = 'microsoft,email'
    this.brandName = ''
    this.brandLogo = ''
    this.primaryColor = '#667eea'
    this._loading = false
    this._error = ''
    this._showEmailForm = false
  }

  /** @returns {string[]} */
  get _enabledProviders() {
    return this.providers.split(',').map((p) => p.trim()).filter(Boolean)
  }

  /** @returns {import('../GeniovaAuth.js').GeniovaAuth | null} */
  _getAuth() {
    try {
      const { GeniovaAuth } = /** @type {any} */ (
        /** @type {*} */ (globalThis).__captainAuth ?? {}
      )
      return GeniovaAuth?.getInstance?.() ?? null
    } catch {
      return null
    }
  }

  async _loginWithProvider(provider) {
    const auth = this._getAuth()
    if (!auth) {
      this._error = 'GeniovaAuth not initialized. Call GeniovaAuth.init() first.'
      return
    }

    this._loading = true
    this._error = ''

    try {
      let user
      switch (provider) {
        case 'microsoft':
          user = await auth.loginWithMicrosoft()
          break
        case 'google':
          user = await auth.loginWithGoogle()
          break
        case 'github':
          user = await auth.loginWithGitHub()
          break
        default:
          throw new Error(`Unknown provider: ${provider}`)
      }
      this.dispatchEvent(new CustomEvent('captain-login-success', {
        detail: { user },
        bubbles: true,
        composed: true,
      }))
    } catch (error) {
      this._error = error.message
      this.dispatchEvent(new CustomEvent('captain-login-error', {
        detail: { error },
        bubbles: true,
        composed: true,
      }))
    } finally {
      this._loading = false
    }
  }

  async _loginWithEmail(e) {
    e.preventDefault()
    const auth = this._getAuth()
    if (!auth) {
      this._error = 'GeniovaAuth not initialized. Call GeniovaAuth.init() first.'
      return
    }

    const form = e.target
    const email = form.email.value
    const password = form.password.value

    this._loading = true
    this._error = ''

    try {
      const user = await auth.loginWithEmail(email, password)
      this.dispatchEvent(new CustomEvent('captain-login-success', {
        detail: { user },
        bubbles: true,
        composed: true,
      }))
    } catch (error) {
      this._error = error.message
      this.dispatchEvent(new CustomEvent('captain-login-error', {
        detail: { error },
        bubbles: true,
        composed: true,
      }))
    } finally {
      this._loading = false
    }
  }

  _renderProviderButton(provider) {
    const labels = {
      microsoft: 'Iniciar sesion con Microsoft',
      google: 'Iniciar sesion con Google',
      github: 'Iniciar sesion con GitHub',
    }

    if (provider === 'email') return null

    return html`
      <button
        class="provider-btn"
        @click=${() => this._loginWithProvider(provider)}
        ?disabled=${this._loading}
      >
        ${labels[provider] ?? provider}
      </button>
    `
  }

  render() {
    const oauthProviders = this._enabledProviders.filter((p) => p !== 'email')
    const hasEmail = this._enabledProviders.includes('email')

    return html`
      <div class="container" style="--captain-primary: ${this.primaryColor}">
        ${this.brandLogo || this.brandName
          ? html`
              <div class="header">
                ${this.brandLogo
                  ? html`<img src=${this.brandLogo} alt=${this.brandName} />`
                  : null}
                ${this.brandName
                  ? html`<h2>${this.brandName}</h2>`
                  : null}
              </div>
            `
          : null}

        ${this._error
          ? html`<div class="error">${this._error}</div>`
          : null}

        ${this._loading
          ? html`<div class="loading">Autenticando...</div>`
          : html`
              ${oauthProviders.map((p) => this._renderProviderButton(p))}

              ${hasEmail && oauthProviders.length > 0
                ? html`<div class="divider"><span>o</span></div>`
                : null}

              ${hasEmail
                ? html`
                    <form @submit=${this._loginWithEmail}>
                      <div class="form-group">
                        <label for="email">Email</label>
                        <input
                          type="email"
                          id="email"
                          name="email"
                          required
                          autocomplete="email"
                        />
                      </div>
                      <div class="form-group">
                        <label for="password">Contrasena</label>
                        <input
                          type="password"
                          id="password"
                          name="password"
                          required
                          autocomplete="current-password"
                        />
                      </div>
                      <button type="submit" class="submit-btn">
                        Iniciar sesion
                      </button>
                    </form>
                  `
                : null}
            `}
      </div>
    `
  }
}

customElements.define('captain-login', CaptainLogin)
