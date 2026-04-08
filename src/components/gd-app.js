import { LitElement, html, css, nothing } from 'lit';
import { ApiClient } from '../lib/api-client.js';
import './gd-file-explorer.js';
import './gd-file-upload.js';
import './gd-admin-aliases.js';
import './gd-admin-audit.js';
import './gd-admin-groups.js';
import './gd-admin-users.js';
import './gd-admin-volumes.js';
import './gd-admin-recycle.js';
import './gd-changelog.js';

export class GdApp extends LitElement {
  static properties = {
    version: { type: String },
    isAdmin: { type: Boolean, attribute: 'is-admin' },
    authUrl: { type: String, attribute: 'auth-url' },
    userName: { type: String, attribute: 'user-name' },
    userEmail: { type: String, attribute: 'user-email' },
    _currentPath: { state: true },
    _searchQuery: { state: true },
    _searchResults: { state: true },
    _searching: { state: true },
    _showResults: { state: true },
    _view: { state: true },
    _darkMode: { state: true },
    _aliases: { state: true },
    _aliasesLoaded: { state: true },
    _adminTab: { state: true },
    _showChangelog: { state: true },
    _userMenuOpen: { state: true },
  };

  constructor() {
    super();
    this.version = '0.1.0';
    this.isAdmin = false;
    this.authUrl = '';
    this.userName = '';
    this.userEmail = '';
    this._currentPath = '';
    this._searchQuery = '';
    /** @type {Array<{name: string, type: string, size: number, modified: string, path: string}>} */
    this._searchResults = [];
    this._searching = false;
    this._showResults = false;
    this._view = /** @type {'explorer'|'admin'} */ ('explorer');
    this._adminTab = /** @type {'aliases'|'groups'|'users'|'volumes'|'audit'} */ ('aliases');
    this._darkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    /** @type {number|null} */
    this._debounceTimer = null;
    /** @type {Array<{id: number, alias_name: string, real_path: string, description: string|null}>} */
    this._aliases = [];
    this._aliasesLoaded = false;
    this._showChangelog = false;
    this._userMenuOpen = false;
  }

  #api = new ApiClient();

  connectedCallback() {
    super.connectedCallback();
    this._loadVersion();
    this._loadAliases();
  }

  async _loadVersion() {
    try {
      const data = await this.#api.getVersion();
      this.version = data.version;
    } catch { /* keep default */ }
  }

  async _loadAliases() {
    try {
      const data = await this.#api.getAliases();
      this._aliases = data.aliases;

      const urlPath = new URL(window.location.href).searchParams.get('path');
      if (urlPath && this._aliases.length > 0) {
        const matchingAlias = this._aliases.find(a =>
          urlPath === a.real_path || urlPath.startsWith(a.real_path + '/')
        );
        this._currentPath = matchingAlias ? urlPath : this._aliases[0].real_path;
      } else if (this._aliases.length > 0) {
        this._currentPath = this._aliases[0].real_path;
      }

      if (this._currentPath) this._syncUrlPath();
    } catch {
      // No aliases available — user sees empty state
    } finally {
      this._aliasesLoaded = true;
    }
  }

  static styles = css`
    :host *:focus-visible {
      outline: 2px solid var(--color-primary, #1a73e8);
      outline-offset: 2px;
    }

    :host {
      display: block;
      min-height: 100vh;
    }

    .app-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 24px;
      background: var(--color-surface, #fff);
      border-bottom: 1px solid var(--color-border, #dadce0);
      box-shadow: var(--shadow, 0 1px 3px rgba(0, 0, 0, 0.12));
      gap: 16px;
    }

    .app-logo {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 20px;
      font-weight: 500;
      color: var(--color-text, #202124);
      flex-shrink: 0;
    }

    .app-logo svg {
      width: 32px;
      height: 32px;
    }

    .search-wrapper {
      position: relative;
      flex: 1;
      max-width: 500px;
    }

    .search-input {
      width: 100%;
      padding: 8px 12px 8px 36px;
      border: 1px solid var(--color-border, #dadce0);
      border-radius: 24px;
      font-size: 14px;
      font-family: inherit;
      outline: none;
      background: var(--color-bg, #f1f3f4);
      color: var(--color-text, #202124);
      box-sizing: border-box;
    }

    .search-input:focus {
      background: var(--color-surface, #fff);
      border-color: var(--color-primary, #1a73e8);
      box-shadow: 0 1px 3px rgba(26, 115, 232, 0.2);
    }

    .search-icon {
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      width: 18px;
      height: 18px;
      color: var(--color-text-secondary, #5f6368);
      pointer-events: none;
    }

    .search-results {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      margin-top: 4px;
      background: var(--color-surface, #fff);
      border: 1px solid var(--color-border, #dadce0);
      border-radius: var(--radius, 8px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      max-height: 400px;
      overflow-y: auto;
      z-index: 100;
    }

    .search-result-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      cursor: pointer;
      font-size: 13px;
      color: var(--color-text, #202124);
      border-bottom: 1px solid var(--color-border-light, #e8eaed);
    }

    .search-result-item:last-child {
      border-bottom: none;
    }

    .search-result-item:hover {
      background: rgba(0, 0, 0, 0.04);
    }

    .search-result-name {
      font-weight: 500;
    }

    .search-result-path {
      color: var(--color-text-secondary, #5f6368);
      font-size: 12px;
      margin-left: auto;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .search-empty {
      padding: 16px 12px;
      text-align: center;
      color: var(--color-text-secondary, #5f6368);
      font-size: 13px;
    }

    .result-icon {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
      color: var(--color-text-secondary, #5f6368);
    }

    .app-main {
      max-width: 1200px;
      margin: 0 auto;
      padding: 16px 24px;
    }

    gd-file-upload {
      margin-bottom: 12px;
    }

    .admin-toggle {
      padding: 8px 16px;
      border: 1px solid var(--color-border, #dadce0);
      border-radius: 4px;
      background: transparent;
      color: var(--color-primary, #1a73e8);
      font-size: 13px;
      font-family: inherit;
      cursor: pointer;
      flex-shrink: 0;
    }

    .admin-toggle:hover {
      background: rgba(26, 115, 232, 0.04);
    }

    .admin-toggle[data-active] {
      background: var(--color-primary, #1a73e8);
      color: #fff;
    }

    .volume-tabs {
      display: flex;
      gap: 0;
      margin-bottom: 16px;
      border-bottom: 2px solid var(--color-border, #dadce0);
    }

    .volume-tab {
      padding: 12px 20px;
      border: none;
      background: transparent;
      font-size: 14px;
      font-family: inherit;
      cursor: pointer;
      color: var(--color-text-secondary, #5f6368);
      border-bottom: 2px solid transparent;
      margin-bottom: -2px;
      transition: color 0.2s, border-color 0.2s;
    }

    .volume-tab:hover {
      color: var(--color-text, #202124);
    }

    .volume-tab[data-active] {
      color: var(--color-primary, #1a73e8);
      border-bottom-color: var(--color-primary, #1a73e8);
      font-weight: 500;
    }

    .theme-toggle {
      background: none;
      border: 1px solid var(--color-border, #dadce0);
      border-radius: 50%;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      color: var(--color-text-secondary, #5f6368);
      transition: background 0.2s, color 0.2s;
    }

    .theme-toggle:hover {
      background: var(--color-hover, #f1f3f4);
      color: var(--color-text, #202124);
    }

    .theme-toggle svg {
      width: 18px;
      height: 18px;
    }

    .alias-tab-wrapper {
      display: inline-flex;
      align-items: center;
      gap: 0;
      position: relative;
    }

    .alias-info-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--color-hover, #f1f3f4);
      color: var(--color-text, #202124);
      font-size: 10px;
      font-weight: 700;
      cursor: help;
      margin-left: 4px;
      flex-shrink: 0;
      position: relative;
    }

    .alias-info-badge:hover {
      background: var(--color-primary, #1a73e8);
      color: #fff;
    }

    .alias-info-badge .tooltip {
      display: none;
      position: absolute;
      bottom: calc(100% + 6px);
      left: 50%;
      transform: translateX(-50%);
      background: var(--color-text, #202124);
      color: #fff;
      font-size: 12px;
      font-weight: 400;
      padding: 4px 8px;
      border-radius: 4px;
      white-space: nowrap;
      z-index: 50;
      pointer-events: none;
    }

    .alias-info-badge:hover .tooltip {
      display: block;
    }

    .no-aliases {
      text-align: center;
      padding: 60px 24px;
      color: var(--color-text-secondary, #5f6368);
    }

    .no-aliases svg {
      width: 64px;
      height: 64px;
      margin-bottom: 16px;
      opacity: 0.4;
    }

    .no-aliases p {
      font-size: 16px;
      margin: 0 0 8px;
    }

    .no-aliases small {
      font-size: 13px;
    }

    .version-link {
      background: none;
      border: none;
      font-size: 12px;
      color: var(--color-text-secondary, #5f6368);
      cursor: pointer;
      flex-shrink: 0;
      font-family: inherit;
      padding: 4px 8px;
      border-radius: 4px;
    }

    .version-link:hover {
      color: var(--color-primary, #1a73e8);
      background: rgba(26, 115, 232, 0.04);
      text-decoration: underline;
    }

    .user-info {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .user-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--color-primary, #1a73e8);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 500;
      flex-shrink: 0;
    }

    .user-name {
      font-size: 13px;
      color: var(--color-text, #202124);
      max-width: 150px;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .user-menu {
      position: relative;
    }

    .user-menu-toggle {
      background: none;
      border: 1px solid var(--color-border, #dadce0);
      border-radius: 4px;
      padding: 8px 12px;
      font-size: 12px;
      font-family: inherit;
      color: var(--color-text-secondary, #5f6368);
      cursor: pointer;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .user-menu-toggle:hover {
      background: rgba(0, 0, 0, 0.04);
    }

    .user-menu-toggle svg {
      width: 14px;
      height: 14px;
    }

    .user-dropdown {
      display: none;
      position: absolute;
      right: 0;
      top: calc(100% + 4px);
      background: var(--color-surface, #fff);
      border: 1px solid var(--color-border, #dadce0);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      min-width: 240px;
      z-index: 100;
      overflow: hidden;
    }

    .user-dropdown.open {
      display: block;
    }

    .user-dropdown-item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 10px 16px;
      background: none;
      border: none;
      font-size: 13px;
      font-family: inherit;
      color: var(--color-text, #202124);
      cursor: pointer;
      text-align: left;
    }

    .user-dropdown-item:hover {
      background: rgba(0, 0, 0, 0.04);
    }

    .user-dropdown-item.danger {
      color: #c5221f;
    }

    .user-dropdown-item.danger:hover {
      background: #fce8e6;
    }

    .user-dropdown-item svg {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }

    .user-dropdown-separator {
      height: 1px;
      background: var(--color-border, #dadce0);
      margin: 4px 0;
    }
  `;

  render() {
    return html`
      <header class="app-header">
        <div class="app-logo">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 7V17C3 18.1 3.9 19 5 19H19C20.1 19 21 18.1 21 17V9C21 7.9 20.1 7 19 7H11L9 5H5C3.9 5 3 5.9 3 7Z" fill="#1a73e8"/>
          </svg>
          Geniova Drive
        </div>

        <div class="search-wrapper">
          <svg class="search-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
          </svg>
          <input
            class="search-input"
            type="text"
            placeholder="Buscar en todo el servidor..."
            .value=${this._searchQuery}
            @input=${this._onSearchInput}
            @keydown=${this._onSearchKeydown}
            @focus=${this._onSearchFocus}
            @blur=${this._onSearchBlur}
            aria-label="Buscar en todo el servidor"
          />
          ${this._showResults && (this._searchResults.length > 0 || (this._searchQuery.length >= 2 && !this._searching)) ? html`
            <div class="search-results" role="listbox">
              ${this._searchResults.length > 0
                ? this._searchResults.map(item => html`
                  <div class="search-result-item" role="option" @mousedown=${() => this._onResultClick(item)}>
                    ${item.type === 'directory'
                      ? html`<svg class="result-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`
                      : html`<svg class="result-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>`
                    }
                    <span class="search-result-name">${item.name}</span>
                    <span class="search-result-path">${this._getRelativePath(item)}</span>
                  </div>
                `)
                : html`<div class="search-empty">No se encontraron resultados</div>`
              }
            </div>
          ` : nothing}
        </div>

        ${this.isAdmin ? html`
          <button class="admin-toggle" ?data-active=${this._view === 'admin'}
            aria-pressed=${this._view === 'admin'}
            @click=${this._toggleView}>
            ${this._view === 'admin' ? 'Explorador' : 'Admin'}
          </button>
        ` : nothing}

        <button class="theme-toggle" @click=${this._toggleTheme}
          title="${this._darkMode ? 'Modo claro' : 'Modo oscuro'}"
          aria-label="${this._darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}">
          ${this._darkMode
            ? html`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 000-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>`
            : html`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/></svg>`
          }
        </button>

        ${this.userName || this.userEmail ? html`
          <div class="user-info">
            <span class="user-avatar">${this._userInitial}</span>
            <span class="user-name" title="${this.userEmail}">${this.userName || this.userEmail}</span>
            <div class="user-menu">
              <button class="user-menu-toggle" @click=${this._toggleUserMenu} title="Menu de usuario">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
              </button>
              <div class="user-dropdown ${this._userMenuOpen ? 'open' : ''}" role="menu">
                <button class="user-dropdown-item" role="menuitem" @click=${this._logout}>
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>
                  Cerrar sesion
                </button>
                <div class="user-dropdown-separator"></div>
                <button class="user-dropdown-item danger" role="menuitem" @click=${this._revokeAllSessions}>
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31A7.902 7.902 0 0112 20zm6.31-3.1L7.1 5.69A7.902 7.902 0 0112 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"/></svg>
                  Cerrar en todos los dispositivos
                </button>
              </div>
            </div>
          </div>
        ` : nothing}

        <button class="version-link" @click=${() => { this._showChangelog = true; }}>v${this.version}</button>
      </header>

      <gd-changelog ?open=${this._showChangelog} @close=${() => { this._showChangelog = false; }}></gd-changelog>

      <main class="app-main">
        ${this._view === 'admin'
          ? html`
              <div class="volume-tabs" role="tablist">
                <button class="volume-tab" role="tab" aria-selected=${this._adminTab === 'aliases'} ?data-active=${this._adminTab === 'aliases'}
                  @click=${() => { this._adminTab = 'aliases'; }}>Alias</button>
                <button class="volume-tab" role="tab" aria-selected=${this._adminTab === 'volumes'} ?data-active=${this._adminTab === 'volumes'}
                  @click=${() => { this._adminTab = 'volumes'; }}>Volumenes</button>
                <button class="volume-tab" role="tab" aria-selected=${this._adminTab === 'groups'} ?data-active=${this._adminTab === 'groups'}
                  @click=${() => { this._adminTab = 'groups'; }}>Grupos</button>
                <button class="volume-tab" role="tab" aria-selected=${this._adminTab === 'users'} ?data-active=${this._adminTab === 'users'}
                  @click=${() => { this._adminTab = 'users'; }}>Usuarios</button>
                <button class="volume-tab" role="tab" aria-selected=${this._adminTab === 'audit'} ?data-active=${this._adminTab === 'audit'}
                  @click=${() => { this._adminTab = 'audit'; }}>Auditoría</button>
                <button class="volume-tab" role="tab" aria-selected=${this._adminTab === 'recycle'} ?data-active=${this._adminTab === 'recycle'}
                  @click=${() => { this._adminTab = 'recycle'; }}>Papelera</button>
              </div>
              ${this._adminTab === 'aliases'
                ? html`<gd-admin-aliases></gd-admin-aliases>`
                : this._adminTab === 'volumes'
                  ? html`<gd-admin-volumes></gd-admin-volumes>`
                  : this._adminTab === 'groups'
                    ? html`<gd-admin-groups></gd-admin-groups>`
                    : this._adminTab === 'users'
                      ? html`<gd-admin-users auth-url=${this.authUrl || ''}></gd-admin-users>`
                      : this._adminTab === 'recycle'
                        ? html`<gd-admin-recycle></gd-admin-recycle>`
                        : html`<gd-admin-audit></gd-admin-audit>`}
            `
          : html`
            ${this._aliasesLoaded ? html`
              ${this._aliases.length > 0 ? html`
                <div class="volume-tabs" role="tablist">
                  ${this._aliases.map(a => html`
                    <span class="alias-tab-wrapper">
                      <button class="volume-tab" role="tab"
                        aria-selected=${this._currentPath === a.real_path || this._currentPath.startsWith(a.real_path + '/')}
                        ?data-active=${this._currentPath === a.real_path || this._currentPath.startsWith(a.real_path + '/')}
                        @click=${() => this._switchVolume(a.real_path)}
                        title=${a.description || a.alias_name}>
                        ${a.alias_name}
                      </button>
                      ${this.isAdmin ? html`
                        <span class="alias-info-badge" aria-label="Ruta real: ${a.real_path}">i<span class="tooltip">${a.real_path}</span></span>
                      ` : nothing}
                    </span>
                  `)}
                </div>
              ` : html`
                <div class="no-aliases">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
                  </svg>
                  <p>No tienes carpetas asignadas</p>
                  <small>${this.isAdmin
                    ? 'Configura alias desde el panel de administracion'
                    : 'Contacta con un administrador para obtener acceso'}</small>
                </div>
              `}

              ${this._currentPath ? html`
                <gd-file-upload
                  .path=${this._currentPath}
                  @upload-complete=${this._onUploadComplete}
                ></gd-file-upload>

                <gd-file-explorer
                  .path=${this._currentPath}
                  .aliasRoot=${this._activeAliasRoot}
                  .aliasName=${this._activeAliasName}
                  @navigate=${this._onNavigate}
                ></gd-file-explorer>
              ` : nothing}
            ` : nothing}
          `}
      </main>
    `;
  }

  /**
   * The active alias matching the current path, or null for raw volume navigation.
   * @returns {{alias_name: string, real_path: string}|null}
   */
  get _activeAlias() {
    return this._aliases.find(a =>
      this._currentPath === a.real_path || this._currentPath.startsWith(a.real_path + '/')
    ) || null;
  }

  /** Alias root path for the file explorer. */
  get _activeAliasRoot() {
    return this._activeAlias?.real_path || '';
  }

  /** Alias display name for breadcrumbs. */
  get _activeAliasName() {
    return this._activeAlias?.alias_name || '';
  }

  /** @param {InputEvent} e */
  _onSearchInput(e) {
    this._searchQuery = /** @type {HTMLInputElement} */ (e.target).value;

    if (this._debounceTimer) clearTimeout(this._debounceTimer);

    if (this._searchQuery.length >= 2) {
      this._debounceTimer = setTimeout(() => this._executeSearch(), 500);
    } else {
      this._searchResults = [];
      this._showResults = false;
    }
  }

  /** @param {KeyboardEvent} e */
  _onSearchKeydown(e) {
    if (e.key === 'Enter' && this._searchQuery.length >= 2) {
      if (this._debounceTimer) clearTimeout(this._debounceTimer);
      this._executeSearch();
    }
    if (e.key === 'Escape') {
      this._showResults = false;
    }
  }

  _onSearchFocus() {
    if (this._searchResults.length > 0) {
      this._showResults = true;
    }
  }

  _onSearchBlur() {
    // Delay to allow click on results
    setTimeout(() => { this._showResults = false; }, 200);
  }

  async _executeSearch() {
    this._searching = true;
    this._showResults = true;

    try {
      const data = await this.#api.searchGlobal(this._searchQuery);
      this._searchResults = data.results;
    } catch {
      this._searchResults = [];
    } finally {
      this._searching = false;
    }
  }

  /**
   * Navigate to the parent folder of the clicked result.
   * @param {{name: string, type: string, path: string, aliasRoot?: string}} item
   */
  _onResultClick(item) {
    if (item.type === 'directory') {
      this._currentPath = item.path;
    } else {
      const parent = item.path.substring(0, item.path.lastIndexOf('/'));
      this._currentPath = parent;
    }
    this._syncUrlPath();
    this._showResults = false;
    this._searchQuery = '';
  }

  /**
   * Get a human-readable relative path for a global search result.
   * Shows: AliasName / relative/path/to/parent
   * @param {{path: string, aliasName?: string, aliasRoot?: string}} item
   * @returns {string}
   */
  _getRelativePath(item) {
    const aliasName = item.aliasName || '';
    const aliasRoot = item.aliasRoot || '';

    // Get parent path
    const parentPath = item.path.substring(0, item.path.lastIndexOf('/'));

    if (aliasRoot && parentPath.startsWith(aliasRoot)) {
      const relative = parentPath.slice(aliasRoot.length).replace(/^\//, '');
      return relative ? `${aliasName} / ${relative}` : aliasName;
    }

    return parentPath || '/';
  }

  _syncUrlPath() {
    const url = new URL(window.location.href);
    url.searchParams.set('path', this._currentPath);
    url.searchParams.delete('page');
    url.searchParams.delete('pageSize');
    window.history.replaceState(null, '', url.toString());
  }

  /** @param {CustomEvent} e */
  _onNavigate(e) {
    this._currentPath = e.detail.path;
    this._syncUrlPath();
  }

  /** @param {string} volume */
  _switchVolume(volume) {
    this._currentPath = volume;
    this._syncUrlPath();
  }

  _toggleTheme() {
    this._darkMode = !this._darkMode;
    const theme = this._darkMode ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('gd-theme', theme);
  }

  _toggleView() {
    this._view = this._view === 'admin' ? 'explorer' : 'admin';
  }

  /** First letter of user name or email for the avatar. */
  get _userInitial() {
    const name = this.userName || this.userEmail || '?';
    return name.charAt(0).toUpperCase();
  }

  _toggleUserMenu() {
    this._userMenuOpen = !this._userMenuOpen;
    if (this._userMenuOpen) {
      // Cerrar al hacer clic fuera
      const clickHandler = (e) => {
        const menu = this.renderRoot.querySelector('.user-menu');
        if (menu && !menu.contains(e.target)) {
          this._userMenuOpen = false;
          cleanup();
        }
      };
      // Cerrar con Escape
      const keyHandler = (e) => {
        if (e.key === 'Escape') {
          this._userMenuOpen = false;
          cleanup();
        }
      };
      const cleanup = () => {
        document.removeEventListener('click', clickHandler);
        document.removeEventListener('keydown', keyHandler);
      };
      // Defer para no capturar el mismo click
      requestAnimationFrame(() => {
        document.addEventListener('click', clickHandler);
        document.addEventListener('keydown', keyHandler);
      });
    }
  }

  async _revokeAllSessions() {
    this._userMenuOpen = false;
    try {
      await fetch('/api/auth/revoke-all-sessions', { method: 'POST' });
    } catch { /* best-effort */ }
    const logoutUrl = new URL('/logout', this.authUrl || 'https://auth.geniova.com');
    logoutUrl.searchParams.set('redirect_uri', window.location.origin);
    window.location.href = logoutUrl.toString();
  }

  async _logout() {
    this._userMenuOpen = false;
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch { /* best-effort */ }
    const logoutUrl = new URL('/logout', this.authUrl || 'https://auth.geniova.com');
    logoutUrl.searchParams.set('redirect_uri', window.location.origin);
    window.location.href = logoutUrl.toString();
  }

  _onUploadComplete() {
    const explorer = this.renderRoot.querySelector('gd-file-explorer');
    if (explorer) explorer.reload();
  }
}

customElements.define('gd-app', GdApp);
