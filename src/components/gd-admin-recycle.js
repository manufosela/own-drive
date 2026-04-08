import { LitElement, html, css, nothing } from 'lit';
import { ApiClient } from '../lib/api-client.js';

/**
 * Admin panel for managing NAS recycle bins (#recycle folders).
 * Allows viewing deleted items and restoring them to a chosen location.
 */
export class GdAdminRecycle extends LitElement {
  static properties = {
    _mounts: { state: true },
    _selectedMount: { state: true },
    _items: { state: true },
    _loading: { state: true },
    _error: { state: true },
    _message: { state: true },
    _restoreTarget: { state: true },
    _restoreDest: { state: true },
    _restoreBrowsePath: { state: true },
    _restoreBrowseItems: { state: true },
    _restoreBrowseLoading: { state: true },
    _operationInProgress: { state: true },
  };

  constructor() {
    super();
    this._mounts = [];
    this._selectedMount = '';
    this._items = [];
    this._loading = true;
    this._error = '';
    this._message = '';
    this._restoreTarget = null;
    this._restoreDest = '';
    this._restoreBrowsePath = '';
    this._restoreBrowseItems = [];
    this._restoreBrowseLoading = false;
    this._operationInProgress = false;
  }

  /** @type {AbortController|null} */
  _focusTrapController = null;

  #api = new ApiClient();

  static styles = css`
    :host { display: block; }
    :host *:focus-visible {
      outline: 2px solid var(--color-primary, #1a73e8);
      outline-offset: 2px;
    }
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
    h2 { margin: 0; font-size: 18px; font-weight: 500; color: var(--color-text, #202124); }
    .error-banner { padding: 12px; background: var(--color-error-bg, #fce8e6); color: var(--color-error-text, #c5221f); border-radius: 8px; margin-bottom: 16px; font-size: 13px; word-wrap: break-word; overflow-wrap: break-word; }
    .success-banner { padding: 12px; background: var(--color-success-bg, #e6f4ea); color: var(--color-success-text, #137333); border-radius: 8px; margin-bottom: 16px; font-size: 13px; word-wrap: break-word; overflow-wrap: break-word; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 8px 12px; border-bottom: 2px solid var(--color-border, #dadce0); color: var(--color-text-secondary, #5f6368); font-weight: 500; font-size: 12px; }
    td { padding: 8px 12px; border-bottom: 1px solid var(--color-border-light, #e8eaed); vertical-align: middle; overflow: hidden; text-overflow: ellipsis; }
    tr:hover td { background: rgba(0,0,0,0.02); }
    .badge { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 500; }
    .badge-count { background: var(--color-hover, #f1f3f4); color: var(--color-text, #202124); }
    .badge-dir { background: var(--color-info-bg, #e8f0fe); color: #1a73e8; }
    .badge-file { background: #f1f3f4; color: #5f6368; }
    .btn { padding: 10px 18px; border: none; border-radius: 4px; font-size: 13px; font-family: inherit; cursor: pointer; }
    .btn-primary { background: var(--color-primary, #1a73e8); color: #fff; }
    .btn-primary:hover { background: var(--color-primary-dark, #1557b0); }
    .btn-primary:disabled { background: var(--color-primary-disabled, #a8c7fa); cursor: not-allowed; }
    .btn-secondary { background: transparent; color: var(--color-primary, #1a73e8); border: 1px solid var(--color-border, #dadce0); }
    .btn-secondary:hover { background: rgba(26,115,232,0.04); }
    .btn-danger { background: transparent; color: var(--color-error-text, #c5221f); border: 1px solid var(--color-error-text, #c5221f); }
    .btn-danger:hover { background: var(--color-danger-hover, rgba(197,34,31,0.06)); }
    .btn-small { padding: 8px 14px; font-size: 12px; }
    .actions { display: flex; gap: 6px; }
    .loading { text-align: center; padding: 40px; color: var(--color-text-secondary); }
    .empty-state { text-align: center; padding: 24px; color: var(--color-text-secondary, #5f6368); }
    .mount-selector { display: flex; gap: 8px; align-items: center; }
    .mount-btn { padding: 10px 18px; border: 1px solid var(--color-border, #dadce0); border-radius: 4px; background: var(--color-surface, #fff); cursor: pointer; font-size: 13px; font-family: inherit; color: var(--color-text, #202124); display: flex; align-items: center; gap: 6px; min-height: 40px; }
    .mount-btn:hover { background: rgba(0,0,0,0.04); }
    .mount-btn[data-active] { background: var(--color-primary, #1a73e8); color: #fff; border-color: var(--color-primary, #1a73e8); }
    .file-size { color: var(--color-text-secondary, #5f6368); font-size: 12px; }
    .deleted-date { color: var(--color-text-secondary, #5f6368); font-size: 12px; }
    .file-icon { width: 16px; height: 16px; color: var(--color-text-secondary, #5f6368); vertical-align: middle; margin-right: 6px; }

    /* Restore dialog */
    .modal-backdrop {
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.5);
      z-index: 2000;
      display: flex; align-items: center; justify-content: center;
    }
    .modal-dialog {
      background: var(--color-surface, #fff);
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      min-width: 420px;
      max-width: 540px;
      max-height: 80vh;
      display: flex; flex-direction: column;
    }
    .modal-dialog h3 {
      margin: 0; padding: 16px 20px; font-size: 16px; font-weight: 600;
      border-bottom: 1px solid var(--color-border, #dadce0);
    }
    .modal-body { padding: 16px 20px; overflow-y: auto; flex: 1; }
    .modal-footer {
      display: flex; justify-content: flex-end; gap: 8px; padding: 12px 20px;
      border-top: 1px solid var(--color-border, #dadce0);
    }
    .modal-footer button {
      padding: 10px 18px; border-radius: 4px; font-size: 13px; font-family: inherit;
      cursor: pointer; border: 1px solid var(--color-border, #dadce0);
      background: var(--color-surface, #fff); color: var(--color-text, #202124);
    }
    .modal-footer button:hover { background: rgba(0,0,0,0.04); }
    .modal-footer button.primary { background: var(--color-primary, #1a73e8); color: #fff; border-color: var(--color-primary, #1a73e8); }
    .modal-footer button.primary:hover { background: var(--color-primary-dark, #1557b0); }
    .modal-footer button.primary:disabled { background: var(--color-primary-disabled, #a8c7fa); cursor: not-allowed; }

    .browse-path {
      display: flex; align-items: center; gap: 4px; padding: 8px 12px;
      font-size: 12px; color: var(--color-text-secondary, #5f6368);
      border-bottom: 1px solid var(--color-border-light, #e8eaed);
      background: var(--color-bg, #f8f9fa);
    }
    .browse-path button {
      background: none; border: none; cursor: pointer;
      color: var(--color-primary, #1a73e8); font-size: 12px;
      font-family: inherit; padding: 2px 4px; border-radius: 3px;
    }
    .browse-path button:hover { background: rgba(26,115,232,0.08); }
    .browse-container {
      border: 1px solid var(--color-border, #dadce0);
      border-radius: 4px; max-height: 300px; overflow-y: auto;
    }
    .browse-item {
      display: flex; align-items: center; gap: 8px; padding: 6px 12px;
      cursor: pointer; font-size: 13px;
      border-bottom: 1px solid var(--color-border-light, #e8eaed);
    }
    .browse-item:hover { background: rgba(0,0,0,0.04); }
    .browse-item:last-child { border-bottom: none; }
    .browse-item svg { width: 16px; height: 16px; color: var(--color-text-secondary, #5f6368); flex-shrink: 0; }
    .dest-label { margin-top: 12px; font-size: 12px; color: var(--color-text-secondary, #5f6368); word-wrap: break-word; overflow-wrap: break-word; }
    .dest-label strong { color: var(--color-text, #202124); }
    .restore-info { font-size: 13px; margin-bottom: 12px; }
  `;

  updated(changed) {
    if (this._restoreTarget) {
      this.updateComplete.then(() => this._setupFocusTrap());
    } else if (this._focusTrapController) {
      this._focusTrapController.abort();
      this._focusTrapController = null;
    }
  }

  _setupFocusTrap() {
    const container = this.renderRoot.querySelector('.modal-dialog');
    if (!container) return;

    this._focusTrapController?.abort();
    this._focusTrapController = new AbortController();

    const focusable = container.querySelectorAll(
      'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first.focus();

    container.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (this.renderRoot.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (this.renderRoot.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }, { signal: this._focusTrapController.signal });
  }

  connectedCallback() {
    super.connectedCallback();
    this._loadMounts();
  }

  async _loadMounts() {
    this._loading = true;
    this._error = '';
    try {
      const data = await this.#api.getRecycleMounts();
      this._mounts = data.mounts;
      // Auto-select first mount with items
      const withItems = this._mounts.find(m => m.recycleCount > 0);
      if (withItems) {
        this._selectedMount = withItems.mount;
        await this._loadItems(withItems.mount);
      } else if (this._mounts.length > 0) {
        this._selectedMount = this._mounts[0].mount;
        this._items = [];
      }
    } catch (err) {
      this._error = err.message;
    } finally {
      this._loading = false;
    }
  }

  async _loadItems(mount) {
    this._loading = true;
    this._selectedMount = mount;
    this._error = '';
    try {
      const data = await this.#api.getRecycleItems(mount);
      this._items = data.items;
    } catch (err) {
      this._error = err.message;
      this._items = [];
    } finally {
      this._loading = false;
    }
  }

  render() {
    return html`
      ${this._error ? html`<div class="error-banner" aria-live="polite">${this._error}</div>` : nothing}
      ${this._message ? html`<div class="success-banner" aria-live="polite">${this._message}</div>` : nothing}

      <div class="header">
        <h2>Papelera</h2>
        ${this._mounts.length > 0 ? html`
          <div class="mount-selector">
            ${this._mounts.map(m => html`
              <button class="mount-btn" ?data-active=${this._selectedMount === m.mount}
                aria-pressed="${this._selectedMount === m.mount}"
                @click=${() => this._loadItems(m.mount)}>
                ${m.mount}
                <span class="badge badge-count">${m.recycleCount}</span>
              </button>
            `)}
          </div>
        ` : nothing}
      </div>

      ${this._loading ? html`<div class="loading" aria-busy="true">Cargando papelera...</div>` : this._renderItems()}
      ${this._restoreTarget ? this._renderRestoreDialog() : nothing}
    `;
  }

  _renderItems() {
    if (this._items.length === 0) {
      return html`<p class="empty-state">No hay elementos en la papelera</p>`;
    }

    return html`
      <table>
        <thead>
          <tr>
            <th scope="col">Nombre original</th>
            <th scope="col">Tipo</th>
            <th scope="col">Tamaño</th>
            <th scope="col">Eliminado</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${this._items.map(item => html`
            <tr>
              <td>
                ${item.type === 'directory'
                  ? html`<svg class="file-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`
                  : html`<svg class="file-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/></svg>`}
                ${item.originalName}
              </td>
              <td><span class="badge ${item.type === 'directory' ? 'badge-dir' : 'badge-file'}">${item.type === 'directory' ? 'Carpeta' : 'Archivo'}</span></td>
              <td class="file-size">${this._formatSize(item.size)}</td>
              <td class="deleted-date">${item.deletedAt ? this._formatDate(item.deletedAt) : '—'}</td>
              <td class="actions">
                <button class="btn btn-secondary btn-small" aria-label="Restaurar ${item.originalName}" @click=${() => this._startRestore(item)}>Restaurar</button>
                <button class="btn btn-danger btn-small" aria-label="Eliminar ${item.originalName}" @click=${() => this._permanentDelete(item)}>Eliminar</button>
              </td>
            </tr>
          `)}
        </tbody>
      </table>
    `;
  }

  _startRestore(item) {
    this._restoreTarget = item;
    this._restoreBrowsePath = this._selectedMount;
    this._restoreDest = this._selectedMount;
    this._loadRestoreBrowse(this._selectedMount);
    this._message = '';
    this._error = '';
  }

  async _loadRestoreBrowse(browsePath) {
    this._restoreBrowseLoading = true;
    this._restoreBrowsePath = browsePath;
    this._restoreDest = browsePath;
    try {
      const data = await this.#api.listDirectory(browsePath, { limit: 200 });
      this._restoreBrowseItems = data.items.filter(i => i.type === 'directory');
    } catch {
      this._restoreBrowseItems = [];
    } finally {
      this._restoreBrowseLoading = false;
    }
  }

  _renderRestoreDialog() {
    const item = this._restoreTarget;
    const pathParts = this._restoreBrowsePath.split('/').filter(Boolean);

    return html`
      <div class="modal-backdrop" @click=${(e) => { if (e.target === e.currentTarget) this._restoreTarget = null; }}
        @keydown=${(e) => { if (e.key === 'Escape') this._restoreTarget = null; }}>
        <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="restore-dialog-title">
          <h3 id="restore-dialog-title">Restaurar "${item.originalName}"</h3>
          <div class="modal-body">
            ${this._operationInProgress
              ? html`<div class="restore-info">Restaurando...</div>`
              : html`
                <p class="restore-info">Elige dónde restaurar el elemento:</p>
                <div class="browse-container">
                  <div class="browse-path">
                    ${pathParts.map((seg, i) => html`
                      ${i > 0 ? html`<span>/</span>` : nothing}
                      <button @click=${() => this._loadRestoreBrowse('/' + pathParts.slice(0, i + 1).join('/'))}>${seg}</button>
                    `)}
                  </div>
                  ${this._restoreBrowseLoading ? html`<div style="padding:16px;text-align:center;color:var(--color-text-secondary, #5f6368);font-size:12px">Cargando...</div>` : nothing}
                  ${!this._restoreBrowseLoading && this._restoreBrowseItems.length === 0 ? html`<div style="padding:12px;text-align:center;color:var(--color-text-secondary, #5f6368);font-size:12px">Sin carpetas</div>` : nothing}
                  ${this._restoreBrowseItems.map(dir => html`
                    <div class="browse-item" @click=${() => this._loadRestoreBrowse(dir.path)}>
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
                      ${dir.name}
                    </div>
                  `)}
                </div>
                <div class="dest-label">Destino: <strong>${this._restoreDest}</strong></div>
              `}
          </div>
          <div class="modal-footer">
            <button @click=${() => { this._restoreTarget = null; }} ?disabled=${this._operationInProgress}>Cancelar</button>
            <button class="primary" @click=${() => this._doRestore()} ?disabled=${this._operationInProgress}>Restaurar en esta carpeta</button>
          </div>
        </div>
      </div>
    `;
  }

  async _doRestore() {
    const item = this._restoreTarget;
    this._operationInProgress = true;
    this._error = '';
    try {
      await this.#api.restoreRecycleItem(item.mount, item.recycledName, this._restoreDest);
      this._message = `"${item.originalName}" restaurado en ${this._restoreDest}`;
      this._restoreTarget = null;
      await this._loadItems(this._selectedMount);
      // Refresh mount counts
      const mountData = await this.#api.getRecycleMounts();
      this._mounts = mountData.mounts;
    } catch (err) {
      this._error = err.message;
    } finally {
      this._operationInProgress = false;
    }
  }

  async _permanentDelete(item) {
    this._error = '';
    this._message = '';
    this._operationInProgress = true;
    try {
      await this.#api.deleteRecycleItem(item.mount, item.recycledName);
      this._message = `"${item.originalName}" eliminado de forma permanente`;
      await this._loadItems(this._selectedMount);
      const mountData = await this.#api.getRecycleMounts();
      this._mounts = mountData.mounts;
    } catch (err) {
      this._error = err.message;
    } finally {
      this._operationInProgress = false;
    }
  }

  /** @param {number} bytes */
  _formatSize(bytes) {
    if (bytes === 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const val = bytes / Math.pow(1024, i);
    return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
  }

  /** @param {string} iso */
  _formatDate(iso) {
    try {
      return new Date(iso).toLocaleString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }
}

customElements.define('gd-admin-recycle', GdAdminRecycle);
