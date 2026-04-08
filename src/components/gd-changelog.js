import { LitElement, html, css, nothing } from 'lit';
import { ApiClient } from '../lib/api-client.js';

/**
 * Modal overlay showing the app changelog.
 * Renders markdown-like changelog content with simple formatting.
 *
 * @fires close - When the user dismisses the modal.
 */
export class GdChangelog extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    _version: { state: true },
    _changelog: { state: true },
    _loading: { state: true },
  };

  constructor() {
    super();
    this.open = false;
    this._version = '';
    this._changelog = '';
    this._loading = false;
  }

  #api = new ApiClient();
  #onKeyDown = (e) => {
    if (e.key === 'Escape' && this.open) this._close();
  };

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this.#onKeyDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.#onKeyDown);
  }

  static styles = css`
    :host { display: none; }
    :host([open]) { display: block; }

    :host *:focus-visible {
      outline: 2px solid var(--color-primary, #1a73e8);
      outline-offset: 2px;
    }

    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    .modal {
      background: var(--color-surface, #fff);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.24);
      max-width: 640px;
      width: 100%;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
    }

    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--color-border, #dadce0);
    }

    .modal-header h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 500;
      color: var(--color-text, #202124);
    }

    .close-btn {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--color-text-secondary, #5f6368);
      padding: 8px;
      min-width: 40px;
      min-height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .close-btn:hover {
      background: var(--color-hover, #f1f3f4);
    }

    .close-btn svg {
      width: 20px;
      height: 20px;
    }

    .modal-body {
      padding: 20px;
      overflow-y: auto;
      font-size: 13px;
      line-height: 1.6;
      color: var(--color-text, #202124);
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    .loading {
      text-align: center;
      padding: 40px;
      color: var(--color-text-secondary, #5f6368);
    }

    .version-title {
      font-size: 15px;
      font-weight: 600;
      margin: 20px 0 8px;
      color: var(--color-text, #202124);
      padding-bottom: 4px;
      border-bottom: 1px solid var(--color-border-light, #e8eaed);
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    .version-title:first-child { margin-top: 0; }

    .section-title {
      font-size: 13px;
      font-weight: 600;
      margin: 12px 0 4px;
      color: var(--color-primary, #1a73e8);
    }

    .change-list {
      margin: 0;
      padding-left: 20px;
    }

    .change-list li {
      margin-bottom: 2px;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    .commit-hash {
      color: var(--color-text-secondary, #5f6368);
      font-family: monospace;
      font-size: 11px;
    }
  `;

  updated(changed) {
    if (changed.has('open') && this.open) {
      if (!this._changelog) this._load();
      this.updateComplete.then(() => this._trapFocus());
    }
  }

  _trapFocus() {
    const modal = this.shadowRoot?.querySelector('.modal');
    if (!modal) return;

    const closeBtn = modal.querySelector('.close-btn');
    if (closeBtn) closeBtn.focus();

    const focusable = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    this.__trapHandler?.abort();
    const controller = new AbortController();
    this.__trapHandler = controller;

    modal.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (this.shadowRoot.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (this.shadowRoot.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }, { signal: controller.signal });
  }

  async _load() {
    this._loading = true;
    try {
      const data = await this.#api.getVersion();
      this._version = data.version;
      this._changelog = data.changelog;
    } catch {
      this._changelog = 'Error al cargar el changelog.';
    } finally {
      this._loading = false;
    }
  }

  render() {
    if (!this.open) return nothing;

    return html`
      <div class="backdrop" @click=${this._onBackdropClick}>
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="changelog-title" @click=${e => e.stopPropagation()}>
          <div class="modal-header">
            <h2 id="changelog-title">Changelog ${this._version ? `— v${this._version}` : ''}</h2>
            <button class="close-btn" @click=${this._close} aria-label="Cerrar">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          </div>
          <div class="modal-body">
            ${this._loading
              ? html`<div class="loading">Cargando changelog...</div>`
              : this._renderChangelog()
            }
          </div>
        </div>
      </div>
    `;
  }

  _renderChangelog() {
    if (!this._changelog) return nothing;

    const lines = this._changelog.split('\n');
    const elements = [];

    for (const line of lines) {
      if (line.startsWith('## ')) {
        elements.push(html`<div class="version-title">${line.slice(3)}</div>`);
      } else if (line.startsWith('### ')) {
        elements.push(html`<div class="section-title">${line.slice(4)}</div>`);
      } else if (line.startsWith('- ')) {
        const text = line.slice(2);
        const hashMatch = text.match(/\(([a-f0-9]{7})\)$/);
        if (hashMatch) {
          const msg = text.slice(0, text.lastIndexOf('('));
          elements.push(html`<ul class="change-list"><li>${msg}<span class="commit-hash">(${hashMatch[1]})</span></li></ul>`);
        } else {
          elements.push(html`<ul class="change-list"><li>${text}</li></ul>`);
        }
      }
    }

    return elements;
  }

  _onBackdropClick() {
    this._close();
  }

  _close() {
    this.open = false;
    this.dispatchEvent(new CustomEvent('close'));
  }
}

customElements.define('gd-changelog', GdChangelog);
