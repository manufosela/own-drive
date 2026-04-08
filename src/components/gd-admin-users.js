import { LitElement, html, css, nothing } from 'lit';
import { ApiClient } from '../lib/api-client.js';

/**
 * Admin panel for viewing users and pre-registering new ones.
 * Full user management (disable, roles) is done in Auth&Sign.
 */
export class GdAdminUsers extends LitElement {
  static properties = {
    authUrl: { type: String, attribute: 'auth-url' },
    _users: { state: true },
    _groups: { state: true },
    _loading: { state: true },
    _error: { state: true },
    _message: { state: true },
    _mode: { state: true },
    _form: { state: true },
    _saving: { state: true },
  };

  constructor() {
    super();
    this.authUrl = '';
    /** @type {Array<{id: number, email: string, display_name: string, is_admin: boolean, is_active: boolean, status: string, groups: Array<{id: number, name: string}>}>} */
    this._users = [];
    /** @type {Array<{id: number, name: string}>} */
    this._groups = [];
    this._loading = true;
    this._error = '';
    this._message = '';
    /** @type {'list'|'create'} */
    this._mode = 'list';
    this._form = { email: '', display_name: '', group_ids: [] };
    this._saving = false;
  }

  #api = new ApiClient();

  static styles = css`
    :host { display: block; }
    :host *:focus-visible {
      outline: 2px solid var(--color-primary, #1a73e8);
      outline-offset: 2px;
    }
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    h2 { margin: 0; font-size: 18px; font-weight: 500; color: var(--color-text, #202124); }
    .info-banner {
      padding: 12px 16px;
      background: var(--color-info-bg, var(--color-info-bg, #e8f0fe));
      color: var(--color-info-text, var(--color-info-text, #174ea6));
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .info-banner a {
      color: var(--color-primary, #1a73e8);
      font-weight: 500;
      text-decoration: none;
    }
    .info-banner a:hover { text-decoration: underline; }
    .error-banner { padding: 12px; background: var(--color-error-bg, #fce8e6); color: var(--color-error-text, #c5221f); border-radius: 8px; margin-bottom: 16px; font-size: 13px; word-wrap: break-word; overflow-wrap: break-word; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 8px 12px; border-bottom: 2px solid var(--color-border, #dadce0); color: var(--color-text-secondary, #5f6368); font-weight: 500; font-size: 12px; }
    td { padding: 8px 12px; border-bottom: 1px solid var(--color-border-light, #e8eaed); vertical-align: middle; overflow: hidden; text-overflow: ellipsis; }
    tr:hover td { background: rgba(0,0,0,0.02); }
    .badge {
      display: inline-flex; align-items: center; justify-content: center;
      padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 500;
    }
    .badge-admin { background: var(--color-info-bg, #e8f0fe); color: var(--color-info-text, #174ea6); }
    .badge-user { background: var(--color-hover, #f1f3f4); color: var(--color-text, #202124); }
    .badge-inactive { background: var(--color-error-bg, #fce8e6); color: var(--color-error-text, #c5221f); }
    .badge-active { background: var(--color-success-bg, #e6f4ea); color: var(--color-success-text, #137333); }
    .groups { display: flex; flex-wrap: wrap; gap: 4px; }
    .group-chip {
      font-size: 11px; padding: 2px 6px; border-radius: 4px;
      background: var(--color-hover, #f1f3f4); color: var(--color-text-secondary, #5f6368);
    }
    .badge-pending { background: var(--color-warning-bg, #fef7e0); color: var(--color-warning-text, #b06000); }
    .loading { text-align: center; padding: 40px; color: var(--color-text-secondary); }
    .empty-state { text-align: center; padding: 24px; color: var(--color-text-secondary, #5f6368); }
    .count { font-size: 13px; color: var(--color-text-secondary, #5f6368); }
    .success-banner { padding: 12px; background: var(--color-success-bg, #e6f4ea); color: var(--color-success-text, #137333); border-radius: 8px; margin-bottom: 16px; font-size: 13px; }
    .btn { padding: 6px 16px; border-radius: 6px; border: 1px solid var(--color-border, #dadce0); background: var(--color-surface, #fff); color: var(--color-text, #202124); cursor: pointer; font-size: 13px; font-weight: 500; min-height: 36px; }
    .btn:hover { background: var(--color-hover, #f1f3f4); }
    .btn-primary { background: var(--color-primary, #1a73e8); color: #fff; border-color: var(--color-primary, #1a73e8); }
    .btn-primary:hover { background: var(--color-primary-hover, #1557b0); }
    .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
    .form-panel { border: 1px solid var(--color-border, #dadce0); border-radius: 8px; padding: 20px; margin-bottom: 16px; background: var(--color-surface, #fff); }
    .form-panel h3 { margin: 0 0 16px; font-size: 15px; font-weight: 500; color: var(--color-text, #202124); }
    .form-field { margin-bottom: 12px; }
    .form-field label { display: block; font-size: 12px; font-weight: 500; color: var(--color-text-secondary, #5f6368); margin-bottom: 4px; }
    .form-field input { width: 100%; padding: 8px 12px; border: 1px solid var(--color-border, #dadce0); border-radius: 6px; font-size: 13px; box-sizing: border-box; background: var(--color-surface, #fff); color: var(--color-text, #202124); }
    .form-field input:focus { outline: none; border-color: var(--color-primary, #1a73e8); box-shadow: 0 0 0 2px rgba(26, 115, 232, 0.2); }
    .form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
    .group-checkboxes { display: flex; flex-wrap: wrap; gap: 8px; }
    .group-checkboxes label { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; color: var(--color-text, #202124); cursor: pointer; }
  `;

  connectedCallback() {
    super.connectedCallback();
    this._loadUsers();
  }

  async _loadUsers() {
    this._loading = true;
    this._error = '';
    try {
      const data = await this.#api.getUsers();
      this._users = data.users;
    } catch (err) {
      this._error = err.message;
    } finally {
      this._loading = false;
    }
  }

  async _startCreate() {
    this._mode = 'create';
    this._form = { email: '', display_name: '', group_ids: [] };
    this._error = '';
    this._message = '';
    try {
      const data = await this.#api.getGroups();
      this._groups = data.groups;
    } catch {
      this._groups = [];
      this._error = 'No se pudieron cargar los grupos. Inténtalo de nuevo.';
      this._mode = 'list';
    }
  }

  _cancelForm() {
    this._mode = 'list';
    this._error = '';
  }

  _toggleGroup(groupId) {
    const ids = this._form.group_ids.includes(groupId)
      ? this._form.group_ids.filter(id => id !== groupId)
      : [...this._form.group_ids, groupId];
    this._form = { ...this._form, group_ids: ids };
  }

  async _savePreRegister() {
    const email = this._form.email.trim();
    if (!email || !email.includes('@')) {
      this._error = 'Debes introducir un email válido';
      return;
    }
    if (this._form.group_ids.length === 0) {
      this._error = 'Debes seleccionar al menos un grupo';
      return;
    }
    this._saving = true;
    this._error = '';
    try {
      await this.#api.preRegisterUser({
        email,
        display_name: this._form.display_name,
        group_ids: this._form.group_ids,
      });
      this._message = `Usuario ${email} pre-registrado correctamente`;
      this._mode = 'list';
      this._loadUsers();
    } catch (err) {
      this._error = err.message;
    } finally {
      this._saving = false;
    }
  }

  /**
   * Derive status from user object. Uses explicit `status` field if present,
   * otherwise falls back to `is_active` for backward compatibility.
   * @param {{status?: string, is_active?: boolean}} user
   * @returns {string}
   */
  _deriveStatus(user) {
    if (user.status) return user.status;
    return user.is_active !== false ? 'active' : 'inactive';
  }

  /** @param {string} status */
  _statusBadgeClass(status) {
    if (status === 'pending') return 'badge badge-pending';
    if (status === 'active') return 'badge badge-active';
    return 'badge badge-inactive';
  }

  /** @param {string} status */
  _statusLabel(status) {
    if (status === 'pending') return 'Pendiente';
    if (status === 'active') return 'Activo';
    return 'Inactivo';
  }

  render() {
    if (this._loading) return html`<div class="loading" aria-busy="true">Cargando usuarios...</div>`;

    return html`
      ${this._error ? html`<div class="error-banner" aria-live="polite">${this._error}</div>` : nothing}
      ${this._message ? html`<div class="success-banner" aria-live="polite">${this._message}</div>` : nothing}
      <div class="info-banner">
        Los usuarios se sincronizan desde Auth&Sign.
        Para gestionar roles y deshabilitarlos,
        ${this.authUrl
          ? html` accede a <a href="${this.authUrl}/admin" target="_blank" rel="noopener">Auth&Sign</a>.`
          : html` usa el portal de Auth&Sign.`}
      </div>
      ${this._mode === 'create' ? this._renderForm() : this._renderList()}
    `;
  }

  _renderList() {
    return html`
      <div class="header">
        <h2>Usuarios</h2>
        <div style="display:flex;align-items:center;gap:12px">
          <span class="count">${this._users.length} usuario${this._users.length !== 1 ? 's' : ''}</span>
          <button class="btn btn-primary" @click=${() => this._startCreate()}>Añadir usuario</button>
        </div>
      </div>
      ${this._users.length === 0
        ? html`<p class="empty-state">No hay usuarios disponibles</p>`
        : html`
          <table>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Email</th>
                <th scope="col">Rol</th>
                <th scope="col">Estado</th>
                <th scope="col">Grupos</th>
              </tr>
            </thead>
            <tbody>
              ${this._users.map(u => html`
                <tr>
                  <td><strong>${u.display_name}</strong></td>
                  <td>${u.email}</td>
                  <td><span class="badge ${u.is_admin ? 'badge-admin' : 'badge-user'}">${u.is_admin ? 'Admin' : 'Usuario'}</span></td>
                  <td><span class="${this._statusBadgeClass(this._deriveStatus(u))}">${this._statusLabel(this._deriveStatus(u))}</span></td>
                  <td>
                    ${u.groups?.length > 0
                      ? html`<div class="groups">${u.groups.map(g => html`<span class="group-chip">${g.name}</span>`)}</div>`
                      : html`<span style="color: var(--color-text-secondary); font-size: 12px">—</span>`}
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
      <div class="form-panel">
        <h3>Pre-registrar usuario</h3>
        <div class="form-field">
          <label for="email">Email *</label>
          <input id="email" type="email" placeholder="usuario@geniova.com" required aria-required="true"
            .value=${this._form.email}
            @input=${e => { this._form = { ...this._form, email: e.target.value }; }}>
        </div>
        <div class="form-field">
          <label for="display_name">Nombre (opcional)</label>
          <input id="display_name" type="text" placeholder="Se usará el prefijo del email si se deja vacío"
            .value=${this._form.display_name}
            @input=${e => { this._form = { ...this._form, display_name: e.target.value }; }}>
        </div>
        ${this._groups.length > 0 ? html`
          <div class="form-field">
            <label id="groups-label">Grupos *</label>
            <div class="group-checkboxes" role="group" aria-labelledby="groups-label">
              ${this._groups.map(g => html`
                <label>
                  <input type="checkbox"
                    .checked=${this._form.group_ids.includes(g.id)}
                    @change=${() => this._toggleGroup(g.id)}>
                  ${g.name}
                </label>
              `)}
            </div>
          </div>
        ` : nothing}
        <div class="form-actions">
          <button class="btn" @click=${() => this._cancelForm()} ?disabled=${this._saving}>Cancelar</button>
          <button class="btn btn-primary" @click=${() => this._savePreRegister()}
            ?disabled=${this._saving || this._form.group_ids.length === 0 || !this._form.email.trim().includes('@')}>
            ${this._saving ? 'Guardando...' : 'Pre-registrar'}
          </button>
        </div>
      </div>
    `;
  }
}

customElements.define('gd-admin-users', GdAdminUsers);
