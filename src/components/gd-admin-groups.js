import { LitElement, html, css, nothing } from 'lit';
import { ApiClient } from '../lib/api-client.js';

/**
 * Admin panel for managing groups and their members.
 * Provides CRUD for groups and member assignment.
 */
export class GdAdminGroups extends LitElement {
  static properties = {
    _groups: { state: true },
    _users: { state: true },
    _loading: { state: true },
    _error: { state: true },
    _message: { state: true },
    _saving: { state: true },
    _mode: { state: true },
    _form: { state: true },
    _expandedGroup: { state: true },
    _members: { state: true },
    _pendingDelete: { state: true },
  };

  constructor() {
    super();
    /** @type {Array<{id: number, name: string, description: string|null, member_count: number}>} */
    this._groups = [];
    /** @type {Array<{id: number, email: string, display_name: string}>} */
    this._users = [];
    this._loading = true;
    this._error = '';
    this._message = '';
    this._saving = false;
    /** @type {'list'|'create'|'edit'} */
    this._mode = 'list';
    this._form = { id: 0, name: '', description: '' };
    /** @type {number|null} */
    this._expandedGroup = null;
    /** @type {Array<{id: number, email: string, display_name: string, joined_at: string}>} */
    this._members = [];
    /** @type {{id: number, name: string}|null} */
    this._pendingDelete = null;
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
    .badge { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 500; background: var(--color-hover, #f1f3f4); color: var(--color-text, #202124); }
    .btn { padding: 10px 18px; border: none; border-radius: 4px; font-size: 13px; font-family: inherit; cursor: pointer; }
    .btn-primary { background: var(--color-primary, #1a73e8); color: #fff; }
    .btn-primary:hover { background: var(--color-primary-dark, #1557b0); }
    .btn-primary:disabled { background: var(--color-primary-disabled, #a8c7fa); cursor: not-allowed; }
    .btn-secondary { background: transparent; color: var(--color-primary, #1a73e8); border: 1px solid var(--color-border, #dadce0); }
    .btn-secondary:hover { background: rgba(26,115,232,0.04); }
    .btn-danger { background: transparent; color: var(--color-danger, #c5221f); border: 1px solid var(--color-danger, #c5221f); }
    .btn-danger:hover { background: var(--color-danger-hover, rgba(197,34,31,0.06)); }
    .btn-small { padding: 8px 14px; font-size: 12px; }
    .actions { display: flex; gap: 6px; }
    .form-panel { background: var(--color-surface, #fff); border: 1px solid var(--color-border, #dadce0); border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .form-row { display: flex; gap: 12px; margin-bottom: 12px; align-items: flex-end; flex-wrap: wrap; }
    .form-field { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
    .form-field label { font-size: 12px; color: var(--color-text-secondary, #5f6368); font-weight: 500; }
    .form-field input, .form-field textarea { padding: 6px 8px; border: 1px solid var(--color-border, #dadce0); border-radius: 4px; font-size: 13px; font-family: inherit; background: var(--color-surface, #fff); color: var(--color-text, #202124); }
    .form-field textarea { resize: vertical; min-height: 40px; }
    .form-actions { display: flex; gap: 8px; justify-content: flex-end; }
    .members-section { margin-top: 12px; padding: 12px; background: var(--color-bg, #f8f9fa); border-radius: 6px; }
    .members-section h4 { margin: 0 0 8px; font-size: 13px; font-weight: 500; }
    .member-list { display: flex; flex-direction: column; gap: 4px; }
    .member-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; background: var(--color-surface, #fff); border: 1px solid var(--color-border-light, #e8eaed); border-radius: 4px; font-size: 13px; }
    .member-name { font-weight: 500; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .member-email { color: var(--color-text-secondary, #5f6368); font-size: 12px; }
    .member-add { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
    .member-add select { font-size: 12px; padding: 4px 6px; border: 1px solid var(--color-border, #dadce0); border-radius: 4px; background: var(--color-surface, #fff); color: var(--color-text, #202124); flex: 1; max-width: 300px; }
    .loading { text-align: center; padding: 40px; color: var(--color-text-secondary); }
    .empty-state { text-align: center; padding: 24px; color: var(--color-text-secondary, #5f6368); }
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal { background: var(--color-surface, #fff); border-radius: 8px; padding: 24px; max-width: 400px; width: 90%; box-shadow: 0 8px 24px rgba(0,0,0,0.15); }
    .modal h3 { margin: 0 0 12px; font-size: 16px; font-weight: 500; color: var(--color-text, #202124); }
    .modal p { margin: 0 0 20px; font-size: 13px; color: var(--color-text-secondary, #5f6368); }
    .modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
  `;

  updated(changed) {
    if (changed.has('_mode') && (this._mode === 'create' || this._mode === 'edit')) {
      this.updateComplete.then(() => this._setupFocusTrap());
    } else if (changed.has('_mode') && this._mode === 'list' && this._focusTrapController) {
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
      const [groupsRes, usersRes] = await Promise.all([
        this.#api.getGroups(),
        this.#api.getUsers(),
      ]);
      this._groups = groupsRes.groups;
      this._users = usersRes.users;
    } catch (err) {
      this._error = err.message;
    } finally {
      this._loading = false;
    }
  }

  render() {
    if (this._loading) return html`<div class="loading" aria-busy="true">Cargando grupos...</div>`;

    return html`
      ${this._error ? html`<div class="error-banner" aria-live="polite">${this._error}</div>` : nothing}
      ${this._message ? html`<div class="success-banner" aria-live="polite">${this._message}</div>` : nothing}
      ${this._mode === 'list' ? this._renderList() : this._renderForm()}
      ${this._pendingDelete ? html`
        <div class="modal-overlay" @click=${() => { this._pendingDelete = null; }}>
          <div class="modal" @click=${e => e.stopPropagation()}>
            <h3>Eliminar grupo</h3>
            <p>¿Estás seguro de que quieres eliminar el grupo <strong>"${this._pendingDelete.name}"</strong>? Esta acción no se puede deshacer.</p>
            <div class="modal-actions">
              <button class="btn btn-secondary" @click=${() => { this._pendingDelete = null; }}>Cancelar</button>
              <button class="btn btn-danger" @click=${() => this._executeDelete()}>Eliminar</button>
            </div>
          </div>
        </div>
      ` : nothing}
    `;
  }

  _renderList() {
    return html`
      <div class="header">
        <h2>Grupos</h2>
        <button class="btn btn-primary" @click=${() => this._startCreate()}>Crear grupo</button>
      </div>
      ${this._groups.length === 0
        ? html`<p class="empty-state">No hay grupos creados</p>`
        : html`
          <table>
            <thead><tr><th scope="col">Nombre</th><th scope="col">Descripcion</th><th scope="col">Miembros</th><th scope="col">Acciones</th></tr></thead>
            <tbody>
              ${this._groups.map(g => html`
                <tr>
                  <td><strong>${g.name}</strong></td>
                  <td>${g.description || html`<span style="color: var(--color-text-secondary)">—</span>`}</td>
                  <td><span class="badge">${g.member_count}</span></td>
                  <td class="actions">
                    <button class="btn btn-secondary btn-small" aria-label="Miembros ${g.name}" @click=${() => this._toggleMembers(g)}>Miembros</button>
                    <button class="btn btn-secondary btn-small" aria-label="Editar ${g.name}" @click=${() => this._startEdit(g)}>Editar</button>
                    <button class="btn btn-danger btn-small" aria-label="Eliminar ${g.name}" @click=${() => this._confirmDelete(g)}>Eliminar</button>
                  </td>
                </tr>
                ${this._expandedGroup === g.id ? html`
                  <tr><td colspan="4">${this._renderMembers(g)}</td></tr>
                ` : nothing}
              `)}
            </tbody>
          </table>
        `}
    `;
  }

  _renderForm() {
    const title = this._mode === 'create' ? 'Crear grupo' : 'Editar grupo';
    return html`
      <div class="header">
        <h2>${title}</h2>
      </div>
      <div class="form-panel">
        <div class="form-row">
          <div class="form-field">
            <label for="group-name">Nombre del grupo</label>
            <input id="group-name" type="text" .value=${this._form.name}
              @input=${e => { this._form = { ...this._form, name: e.target.value }; }}
              placeholder="Ej: Produccion" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label for="group-desc">Descripcion</label>
            <textarea id="group-desc" .value=${this._form.description || ''}
              @input=${e => { this._form = { ...this._form, description: e.target.value }; }}
              placeholder="Opcional"></textarea>
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-secondary" @click=${() => { this._mode = 'list'; }}>Cancelar</button>
          <button class="btn btn-primary" ?disabled=${this._saving || !this._form.name.trim()}
            @click=${() => this._saveGroup()}>${this._saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    `;
  }

  /** @param {{id: number, name: string}} group */
  _renderMembers(group) {
    const memberIds = new Set(this._members.map(m => m.id));
    const available = this._users.filter(u => !memberIds.has(u.id));

    return html`
      <div class="members-section">
        <h4>Miembros de "${group.name}"</h4>
        ${this._members.length === 0
          ? html`<p style="font-size: 12px; color: var(--color-text-secondary)">Este grupo no tiene miembros</p>`
          : html`
            <div class="member-list">
              ${this._members.map(m => html`
                <div class="member-item">
                  <span class="member-name">${m.display_name}</span>
                  <span class="member-email">${m.email}</span>
                  <button class="btn btn-danger btn-small" aria-label="Quitar ${m.display_name}" @click=${() => this._removeMember(group.id, m.id)}>Quitar del grupo</button>
                </div>
              `)}
            </div>
          `}
        ${available.length > 0 ? html`
          <div class="member-add">
            <select id="add-member-select" aria-label="Seleccionar usuario para añadir al grupo">
              ${available.map(u => html`<option value=${u.id}>${u.display_name} (${u.email})</option>`)}
            </select>
            <button class="btn btn-secondary btn-small" @click=${() => this._addMember(group.id)}>Agregar</button>
          </div>
        ` : nothing}
      </div>
    `;
  }

  // ── Actions ────────────────────────────────────────

  _startCreate() {
    this._form = { id: 0, name: '', description: '' };
    this._mode = 'create';
    this._message = '';
    this._error = '';
  }

  /** @param {{id: number, name: string, description: string|null}} group */
  _startEdit(group) {
    this._form = { id: group.id, name: group.name, description: group.description || '' };
    this._mode = 'edit';
    this._message = '';
    this._error = '';
  }

  async _saveGroup() {
    this._saving = true;
    this._error = '';
    this._message = '';
    try {
      if (this._mode === 'create') {
        await this.#api.createGroup({
          name: this._form.name.trim(),
          description: this._form.description?.trim() || null,
        });
        this._message = `Grupo "${this._form.name}" creado`;
      } else {
        await this.#api.updateGroup({
          id: this._form.id,
          name: this._form.name.trim(),
          description: this._form.description?.trim() || null,
        });
        this._message = `Grupo "${this._form.name}" actualizado`;
      }
      this._mode = 'list';
      await this._loadData();
    } catch (err) {
      this._error = err.message;
    } finally {
      this._saving = false;
    }
  }

  /** @param {{id: number, name: string}} group */
  _confirmDelete(group) {
    this._pendingDelete = group;
  }

  async _executeDelete() {
    const group = this._pendingDelete;
    this._pendingDelete = null;
    if (!group) return;
    this._error = '';
    this._message = '';
    try {
      await this.#api.deleteGroup(group.id);
      this._message = `Grupo "${group.name}" eliminado`;
      this._expandedGroup = null;
      await this._loadData();
    } catch (err) {
      this._error = err.message;
    }
  }

  // ── Members ────────────────────────────────────────

  /** @param {{id: number}} group */
  async _toggleMembers(group) {
    if (this._expandedGroup === group.id) {
      this._expandedGroup = null;
      return;
    }
    this._expandedGroup = group.id;
    try {
      const data = await this.#api.getGroup(group.id);
      this._members = data.members;
    } catch (err) {
      this._error = err.message;
    }
  }

  /** @param {number} groupId */
  async _addMember(groupId) {
    const select = this.renderRoot.querySelector('#add-member-select');
    if (!select) return;
    const userId = Number(/** @type {HTMLSelectElement} */ (select).value);
    if (!userId) return;
    this._error = '';
    try {
      await this.#api.addGroupMember(groupId, userId);
      const data = await this.#api.getGroup(groupId);
      this._members = data.members;
      await this._loadData();
    } catch (err) {
      this._error = err.message;
    }
  }

  /**
   * @param {number} groupId
   * @param {number} userId
   */
  async _removeMember(groupId, userId) {
    this._error = '';
    try {
      await this.#api.removeGroupMember(groupId, userId);
      const data = await this.#api.getGroup(groupId);
      this._members = data.members;
      await this._loadData();
    } catch (err) {
      this._error = err.message;
    }
  }
}

customElements.define('gd-admin-groups', GdAdminGroups);
