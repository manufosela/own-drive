import { LitElement, html, css, nothing } from 'lit';
import { ApiClient } from '../lib/api-client.js';

/**
 * Admin panel for managing NAS volumes (mount points).
 * Allows registering, activating/deactivating, and removing volumes.
 */
export class GdAdminVolumes extends LitElement {
  static properties = {
    _volumes: { state: true },
    _loading: { state: true },
    _error: { state: true },
    _message: { state: true },
    _saving: { state: true },
    _mode: { state: true },
    _form: { state: true },
  };

  constructor() {
    super();
    /** @type {Array<{id: number, name: string, mount_path: string, active: boolean, alias_count: number}>} */
    this._volumes = [];
    this._loading = true;
    this._error = '';
    this._message = '';
    this._saving = false;
    /** @type {'list'|'create'} */
    this._mode = 'list';
    this._form = { name: '', mount_path: '' };
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
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    h2 { margin: 0; font-size: 18px; font-weight: 500; color: var(--color-text, #202124); }
    .error-banner { padding: 12px; background: var(--color-error-bg, #fce8e6); color: var(--color-error-text, #c5221f); border-radius: 8px; margin-bottom: 16px; font-size: 13px; word-wrap: break-word; overflow-wrap: break-word; }
    .success-banner { padding: 12px; background: var(--color-success-bg, #e6f4ea); color: var(--color-success-text, #137333); border-radius: 8px; margin-bottom: 16px; font-size: 13px; word-wrap: break-word; overflow-wrap: break-word; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 8px 12px; border-bottom: 2px solid var(--color-border, #dadce0); color: var(--color-text-secondary, #5f6368); font-weight: 500; font-size: 12px; }
    td { padding: 8px 12px; border-bottom: 1px solid var(--color-border-light, #e8eaed); vertical-align: middle; overflow: hidden; text-overflow: ellipsis; }
    tr:hover td { background: rgba(0,0,0,0.02); }
    .badge { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 500; }
    .badge-active { background: var(--color-success-bg, #e6f4ea); color: var(--color-success-text, #137333); }
    .badge-inactive { background: var(--color-error-bg, #fce8e6); color: var(--color-error-text, #c5221f); }
    .badge-count { background: var(--color-hover, #f1f3f4); color: var(--color-text, #202124); }
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
    .form-panel { background: var(--color-surface, #fff); border: 1px solid var(--color-border, #dadce0); border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .form-row { display: flex; gap: 12px; margin-bottom: 12px; align-items: flex-end; flex-wrap: wrap; }
    .form-field { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
    .form-field label { font-size: 12px; color: var(--color-text-secondary, #5f6368); font-weight: 500; }
    .form-field input { padding: 6px 8px; border: 1px solid var(--color-border, #dadce0); border-radius: 4px; font-size: 13px; font-family: inherit; background: var(--color-surface, #fff); color: var(--color-text, #202124); }
    .form-actions { display: flex; gap: 8px; justify-content: flex-end; }
    .mono { font-family: monospace; font-size: 12px; color: var(--color-text-secondary, #5f6368); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 300px; display: inline-block; }
    .loading { text-align: center; padding: 40px; color: var(--color-text-secondary); }
    .empty-state { text-align: center; padding: 24px; color: var(--color-text-secondary, #5f6368); }
  `;

  updated(changed) {
    if (changed.has('_mode') && this._mode === 'create') {
      this.updateComplete.then(() => this._setupFocusTrap());
    } else if (changed.has('_mode') && this._mode !== 'create' && this._focusTrapController) {
      this._focusTrapController.abort();
      this._focusTrapController = null;
    }
  }

  _setupFocusTrap() {
    const container = this.renderRoot.querySelector('.form-panel');
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
    this._loadData();
  }

  async _loadData() {
    this._loading = true;
    this._error = '';
    try {
      const data = await this.#api.getVolumes();
      this._volumes = data.volumes;
    } catch (err) {
      this._error = err.message;
    } finally {
      this._loading = false;
    }
  }

  render() {
    if (this._loading) return html`<div class="loading" aria-busy="true">Cargando volúmenes...</div>`;

    return html`
      ${this._error ? html`<div class="error-banner" aria-live="polite">${this._error}</div>` : nothing}
      ${this._message ? html`<div class="success-banner" aria-live="polite">${this._message}</div>` : nothing}
      ${this._mode === 'list' ? this._renderList() : this._renderForm()}
    `;
  }

  _renderList() {
    return html`
      <div class="header">
        <h2>Volumenes</h2>
        <button class="btn btn-primary" @click=${() => this._startCreate()}>Registrar volumen</button>
      </div>
      ${this._volumes.length === 0
        ? html`<p class="empty-state">No hay volúmenes configurados</p>`
        : html`
          <table>
            <thead><tr><th scope="col">Nombre</th><th scope="col">Punto de montaje</th><th scope="col">Estado</th><th scope="col">Aliases</th><th scope="col">Acciones</th></tr></thead>
            <tbody>
              ${this._volumes.map(v => html`
                <tr>
                  <td><strong>${v.name}</strong></td>
                  <td><span class="mono">${v.mount_path}</span></td>
                  <td>
                    <span class="badge ${v.active ? 'badge-active' : 'badge-inactive'}">
                      ${v.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td><span class="badge badge-count">${v.alias_count}</span></td>
                  <td class="actions">
                    <button class="btn btn-secondary btn-small"
                      aria-label="${v.active ? 'Desactivar' : 'Activar'} ${v.name}"
                      @click=${() => this._toggleActive(v)}>
                      ${v.active ? 'Desactivar' : 'Activar'}
                    </button>
                    <button class="btn btn-danger btn-small"
                      ?disabled=${v.alias_count > 0}
                      title=${v.alias_count > 0 ? 'Elimina primero los alias asociados' : 'Eliminar volumen'}
                      aria-label="Eliminar ${v.name}"
                      @click=${() => this._confirmDelete(v)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              `)}
            </tbody>
          </table>
        `}
    `;
  }

  _renderForm() {
    return html`
      <div class="header">
        <h2>Registrar volumen</h2>
      </div>
      <div class="form-panel">
        <div class="form-row">
          <div class="form-field">
            <label for="vol-name">Nombre</label>
            <input id="vol-name" type="text" .value=${this._form.name}
              @input=${e => { this._form = { ...this._form, name: e.target.value }; }}
              placeholder="Ej: raid5" />
          </div>
          <div class="form-field">
            <label for="vol-path">Punto de montaje</label>
            <input id="vol-path" type="text" .value=${this._form.mount_path}
              @input=${e => { this._form = { ...this._form, mount_path: e.target.value }; }}
              placeholder="Ej: /media/raid5" />
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-secondary" @click=${() => { this._mode = 'list'; }}>Cancelar</button>
          <button class="btn btn-primary"
            ?disabled=${this._saving || !this._form.name.trim() || !this._form.mount_path.trim()}
            @click=${() => this._saveVolume()}>
            ${this._saving ? 'Guardando...' : 'Registrar'}
          </button>
        </div>
      </div>
    `;
  }

  _startCreate() {
    this._form = { name: '', mount_path: '' };
    this._mode = 'create';
    this._message = '';
    this._error = '';
  }

  async _saveVolume() {
    this._saving = true;
    this._error = '';
    try {
      await this.#api.createVolume({
        name: this._form.name.trim(),
        mount_path: this._form.mount_path.trim(),
      });
      this._message = `Volumen "${this._form.name}" registrado`;
      this._mode = 'list';
      await this._loadData();
    } catch (err) {
      this._error = err.message;
    } finally {
      this._saving = false;
    }
  }

  /** @param {{id: number, name: string, active: boolean}} vol */
  async _toggleActive(vol) {
    this._error = '';
    this._message = '';
    try {
      await this.#api.updateVolume({ id: vol.id, active: !vol.active });
      this._message = vol.active
        ? `Volumen "${vol.name}" desactivado (aliases ocultos)`
        : `Volumen "${vol.name}" activado (aliases visibles)`;
      await this._loadData();
    } catch (err) {
      this._error = err.message;
    }
  }

  /** @param {{id: number, name: string}} vol */
  async _confirmDelete(vol) {
    this._error = '';
    this._message = '';
    try {
      await this.#api.deleteVolume(vol.id);
      this._message = `Volumen "${vol.name}" eliminado`;
      await this._loadData();
    } catch (err) {
      this._error = err.message;
    }
  }
}

customElements.define('gd-admin-volumes', GdAdminVolumes);
