import { LitElement, html, css, nothing } from 'lit';
import { ApiClient } from '../lib/api-client.js';

/**
 * Admin panel for managing folder aliases and their group permissions.
 * Provides CRUD for aliases and per-group permission assignment.
 */
export class GdAdminAliases extends LitElement {
  static properties = {
    _aliases: { state: true },
    _groups: { state: true },
    _loading: { state: true },
    _error: { state: true },
    _message: { state: true },
    _saving: { state: true },
    _mode: { state: true },
    _form: { state: true },
    _permissions: { state: true },
    _expandedAlias: { state: true },
    _browsing: { state: true },
    _browsePath: { state: true },
    _browseItems: { state: true },
    _browseLoading: { state: true },
    _volumes: { state: true },
    _pendingDelete: { state: true },
  };

  constructor() {
    super();
    /** @type {Array<{id: number, alias_name: string, real_path: string, description: string|null, visible: boolean, permission_count: number}>} */
    this._aliases = [];
    /** @type {Array<{id: number, name: string}>} */
    this._groups = [];
    this._loading = true;
    this._error = '';
    this._message = '';
    this._saving = false;
    /** @type {'list'|'create'|'edit'} */
    this._mode = 'list';
    this._form = { id: 0, alias_name: '', real_path: '', description: '', visible: true };
    /** @type {Array<{group_id: number, group_name: string, can_read: boolean, can_write: boolean, can_delete: boolean, can_move: boolean}>} */
    this._permissions = [];
    /** @type {number|null} */
    this._expandedAlias = null;
    this._browsing = false;
    this._browsePath = '';
    /** @type {Array<{name: string, type: string, path: string}>} */
    this._browseItems = [];
    this._browseLoading = false;
    /** @type {Array<{id: number, name: string, mount_path: string, active: boolean}>} */
    this._volumes = [];
    /** @type {{id: number, alias_name: string}|null} */
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
    input[type="checkbox"]:focus-visible {
      outline: 2px solid var(--color-primary, #1a73e8);
      outline-offset: 2px;
    }
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    h2 { margin: 0; font-size: 18px; font-weight: 500; color: var(--color-text, #202124); }
    .error-banner { padding: 12px; background: var(--color-error-bg, #fce8e6); color: var(--color-error-text, #c5221f); border-radius: 8px; margin-bottom: 16px; font-size: 13px; }
    .success-banner { padding: 12px; background: var(--color-success-bg, #e6f4ea); color: var(--color-success-text, #137333); border-radius: 8px; margin-bottom: 16px; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 8px 12px; border-bottom: 2px solid var(--color-border, #dadce0); color: var(--color-text-secondary, #5f6368); font-weight: 500; font-size: 12px; }
    td { padding: 8px 12px; border-bottom: 1px solid var(--color-border-light, #e8eaed); vertical-align: middle; overflow: hidden; text-overflow: ellipsis; }
    tr:hover td { background: rgba(0,0,0,0.02); }
    .mono { font-family: monospace; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 300px; }
    .error-banner, .success-banner { word-wrap: break-word; overflow-wrap: break-word; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 500; }
    .badge-on { background: var(--color-success-bg, #e6f4ea); color: var(--color-success-text, #137333); }
    .badge-off { background: var(--color-error-bg, #fce8e6); color: var(--color-error-text, #c5221f); }
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
    .form-field input, .form-field select, .form-field textarea { padding: 6px 8px; border: 1px solid var(--color-border, #dadce0); border-radius: 4px; font-size: 13px; font-family: inherit; }
    .form-field textarea { resize: vertical; min-height: 40px; }
    .form-actions { display: flex; gap: 8px; justify-content: flex-end; }
    .browse-panel { border: 1px solid var(--color-border, #dadce0); border-radius: 4px; margin-top: 8px; max-height: 200px; overflow-y: auto; }
    .browse-item { display: flex; align-items: center; gap: 6px; padding: 6px 10px; cursor: pointer; font-size: 13px; border-bottom: 1px solid var(--color-border-light, #e8eaed); }
    .browse-item:hover { background: rgba(0,0,0,0.04); }
    .browse-item:last-child { border-bottom: none; }
    .browse-header { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: var(--color-bg, #f1f3f4); font-size: 12px; color: var(--color-text-secondary, #5f6368); border-bottom: 1px solid var(--color-border, #dadce0); }
    .browse-header button { background: none; border: none; cursor: pointer; color: var(--color-primary, #1a73e8); font-size: 12px; padding: 2px 6px; }
    .perms-section { margin-top: 12px; padding: 12px; background: var(--color-bg, #f8f9fa); border-radius: 6px; }
    .perms-section h4 { margin: 0 0 8px; font-size: 13px; font-weight: 500; }
    .perms-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .perms-table th { padding: 4px 8px; text-align: center; font-weight: 500; color: var(--color-text-secondary); }
    .perms-table th:first-child { text-align: left; }
    .perms-table td { padding: 4px 8px; text-align: center; }
    .perms-table td:first-child { text-align: left; }
    .perms-add { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
    .perms-add select { font-size: 12px; padding: 4px 6px; }
    .loading { text-align: center; padding: 40px; color: var(--color-text-secondary); }
    .mini-spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid var(--color-border); border-top-color: var(--color-primary, #1a73e8); border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
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
      const [aliasRes, groupsRes, volRes] = await Promise.all([
        this.#api.getAdminAliases(),
        this.#api.getGroups(),
        this.#api.getVolumes(),
      ]);
      this._aliases = aliasRes.aliases;
      this._groups = groupsRes.groups;
      this._volumes = volRes.volumes.filter(v => v.active);
    } catch (err) {
      this._error = err.message;
    } finally {
      this._loading = false;
    }
  }

  render() {
    if (this._loading) return html`<div class="loading" aria-busy="true">Cargando alias...</div>`;

    return html`
      ${this._error ? html`<div class="error-banner" aria-live="polite">${this._error}</div>` : nothing}
      ${this._message ? html`<div class="success-banner" aria-live="polite">${this._message}</div>` : nothing}

      ${this._mode === 'list' ? this._renderList() : this._renderForm()}
      ${this._pendingDelete ? html`
        <div class="modal-overlay" @click=${() => { this._pendingDelete = null; }}>
          <div class="modal" @click=${e => e.stopPropagation()}>
            <h3>Eliminar alias</h3>
            <p>¿Estás seguro de que quieres eliminar el alias <strong>"${this._pendingDelete.alias_name}"</strong>? Esta acción no se puede deshacer.</p>
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
        <h2>Alias de carpetas</h2>
        <button class="btn btn-primary" @click=${() => this._startCreate()}>Crear alias</button>
      </div>
      ${this._aliases.length === 0
        ? html`<p style="color: var(--color-text-secondary); text-align: center; padding: 24px;">No hay alias configurados</p>`
        : html`
          <table>
            <thead><tr><th scope="col">Nombre</th><th scope="col">Ruta real</th><th scope="col">Visible</th><th scope="col">Grupos</th><th scope="col">Acciones</th></tr></thead>
            <tbody>
              ${this._aliases.map(a => html`
                <tr>
                  <td><strong>${a.alias_name}</strong>${a.description ? html`<br><small style="color: var(--color-text-secondary)">${a.description}</small>` : nothing}</td>
                  <td class="mono">${a.real_path}</td>
                  <td><span class="badge ${a.visible ? 'badge-on' : 'badge-off'}">${a.visible ? 'Visible' : 'Oculto'}</span></td>
                  <td>${a.permission_count || 0}</td>
                  <td class="actions">
                    <button class="btn btn-secondary btn-small" aria-label="Permisos ${a.alias_name}" @click=${() => this._togglePermissions(a)}>Permisos</button>
                    <button class="btn btn-secondary btn-small" aria-label="Editar ${a.alias_name}" @click=${() => this._startEdit(a)}>Editar</button>
                    <button class="btn btn-danger btn-small" aria-label="Eliminar ${a.alias_name}" @click=${() => this._confirmDelete(a)}>Eliminar</button>
                  </td>
                </tr>
                ${this._expandedAlias === a.id ? html`
                  <tr><td colspan="5">${this._renderPermissions(a)}</td></tr>
                ` : nothing}
              `)}
            </tbody>
          </table>
        `}
    `;
  }

  _renderForm() {
    const title = this._mode === 'create' ? 'Crear alias' : 'Editar alias';
    return html`
      <div class="header">
        <h2>${title}</h2>
      </div>
      <div class="form-panel">
        <div class="form-row">
          <div class="form-field">
            <label for="alias-name">Nombre del alias</label>
            <input id="alias-name" type="text" .value=${this._form.alias_name}
              @input=${e => { this._form = { ...this._form, alias_name: e.target.value }; }} placeholder="Ej: Proyectos STL" />
          </div>
          <div class="form-field" style="max-width: 120px; flex: 0;">
            <label>Visible</label>
            <select .value=${this._form.visible ? 'true' : 'false'}
              @change=${e => { this._form = { ...this._form, visible: e.target.value === 'true' }; }}>
              <option value="true">Visible</option>
              <option value="false">Oculto</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label>Ruta en el servidor</label>
            <div style="display: flex; gap: 6px;">
              <input type="text" style="flex:1" .value=${this._form.real_path}
                @input=${e => { this._form = { ...this._form, real_path: e.target.value }; }} placeholder="/datosnas/dept/stls" />
              <button class="btn btn-secondary btn-small" @click=${() => this._toggleBrowse()}>
                ${this._browsing ? 'Cerrar' : 'Explorar'}
              </button>
            </div>
            ${this._browsing ? this._renderBrowser() : nothing}
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label for="alias-desc">Descripcion</label>
            <textarea id="alias-desc" .value=${this._form.description || ''}
              @input=${e => { this._form = { ...this._form, description: e.target.value }; }} placeholder="Opcional"></textarea>
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-secondary" @click=${() => { this._mode = 'list'; this._browsing = false; }}>Cancelar</button>
          <button class="btn btn-primary" ?disabled=${this._saving || !this._form.alias_name || !this._form.real_path}
            @click=${() => this._saveAlias()}>${this._saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    `;
  }

  _renderBrowser() {
    // Show volume list when no path is selected yet
    if (!this._browsePath) {
      return html`
        <div class="browse-panel">
          <div class="browse-header">
            <span style="flex:1; font-weight: 500;">Selecciona un volumen para explorar</span>
          </div>
          ${this._volumes.length === 0
            ? html`<div style="padding: 12px; text-align: center; font-size: 12px; color: var(--color-text-secondary)">No hay volúmenes disponibles</div>`
            : this._volumes.filter(v => v.virtual_path).map(v => html`
              <div class="browse-item" role="button" aria-label="Seleccionar volumen ${v.name}" @click=${() => this._browseInto(v.virtual_path)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--color-text-secondary)"><path d="M2 20h20v-4H2v4zm2-3h2v2H4v-2zM2 4v4h20V4H2zm4 3H4V5h2v2zm-4 7h20v-4H2v4zm2-3h2v2H4v-2z"/></svg>
                <strong>${v.name}</strong>&nbsp;<span class="mono" style="color: var(--color-text-secondary)">${v.virtual_path}</span>
              </div>
            `)}
        </div>
      `;
    }

    return html`
      <div class="browse-panel">
        <div class="browse-header">
          <button aria-label="Subir un nivel" @click=${() => this._browseUp()}>&larr;</button>
          <span class="mono" style="flex:1">${this._browsePath}</span>
          <button class="btn btn-primary btn-small" @click=${() => { this._form = { ...this._form, real_path: this._browsePath }; this._browsing = false; }}>
            Seleccionar
          </button>
        </div>
        ${this._browseLoading
          ? html`<div style="padding: 12px; text-align: center;"><span class="mini-spinner"></span></div>`
          : this._browseItems.filter(i => i.type === 'directory').length === 0
            ? html`<div style="padding: 12px; text-align: center; font-size: 12px; color: var(--color-text-secondary)">Sin carpetas</div>`
            : this._browseItems.filter(i => i.type === 'directory').map(item => html`
              <div class="browse-item" role="button" aria-label="Abrir carpeta ${item.name}" @click=${() => this._browseInto(item.path)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--color-text-secondary)"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
                ${item.name}
              </div>
            `)}
      </div>
    `;
  }

  /** @param {{id: number}} alias */
  _renderPermissions(alias) {
    const unassigned = this._groups.filter(g => !this._permissions.some(p => p.group_id === g.id));
    return html`
      <div class="perms-section">
        <h4>Permisos de grupo para "${alias.alias_name || ''}"</h4>
        ${this._permissions.length === 0
          ? html`<p style="font-size: 12px; color: var(--color-text-secondary)">Sin permisos asignados</p>`
          : html`
            <table class="perms-table">
              <thead><tr><th scope="col">Grupo</th><th scope="col">Leer</th><th scope="col">Escribir</th><th scope="col">Borrar</th><th scope="col">Mover</th><th scope="col"></th></tr></thead>
              <tbody>
                ${this._permissions.map(p => html`
                  <tr>
                    <td>${p.group_name}</td>
                    <td><input type="checkbox" .checked=${p.can_read} @change=${e => this._updatePerm(alias.id, p.group_id, 'can_read', e.target.checked)} /></td>
                    <td><input type="checkbox" .checked=${p.can_write} @change=${e => this._updatePerm(alias.id, p.group_id, 'can_write', e.target.checked)} /></td>
                    <td><input type="checkbox" .checked=${p.can_delete} @change=${e => this._updatePerm(alias.id, p.group_id, 'can_delete', e.target.checked)} /></td>
                    <td><input type="checkbox" .checked=${p.can_move} @change=${e => this._updatePerm(alias.id, p.group_id, 'can_move', e.target.checked)} /></td>
                    <td><button class="btn btn-danger btn-small" @click=${() => this._removePerm(alias.id, p.group_id)}>Quitar acceso</button></td>
                  </tr>
                `)}
              </tbody>
            </table>
          `}
        ${unassigned.length > 0 ? html`
          <div class="perms-add">
            <select id="add-group-select">
              ${unassigned.map(g => html`<option value=${g.id}>${g.name}</option>`)}
            </select>
            <button class="btn btn-secondary btn-small" @click=${() => this._addPerm(alias.id)}>Añadir grupo</button>
          </div>
        ` : nothing}
      </div>
    `;
  }

  // ── Actions ────────────────────────────────────────

  _startCreate() {
    this._form = { id: 0, alias_name: '', real_path: '', description: '', visible: true };
    this._mode = 'create';
    this._message = '';
    this._error = '';
  }

  /** @param {{id: number, alias_name: string, real_path: string, description: string|null, visible: boolean}} alias */
  _startEdit(alias) {
    this._form = { id: alias.id, alias_name: alias.alias_name, real_path: alias.real_path, description: alias.description || '', visible: alias.visible };
    this._mode = 'edit';
    this._message = '';
    this._error = '';
  }

  async _saveAlias() {
    this._saving = true;
    this._error = '';
    this._message = '';
    try {
      if (this._mode === 'create') {
        await this.#api.createAlias({
          alias_name: this._form.alias_name,
          real_path: this._form.real_path,
          description: this._form.description || null,
          visible: this._form.visible,
        });
        this._message = `Alias "${this._form.alias_name}" creado`;
      } else {
        await this.#api.updateAlias({
          id: this._form.id,
          alias_name: this._form.alias_name,
          real_path: this._form.real_path,
          description: this._form.description || null,
          visible: this._form.visible,
        });
        this._message = `Alias "${this._form.alias_name}" actualizado`;
      }
      this._mode = 'list';
      this._browsing = false;
      await this._loadData();
    } catch (err) {
      this._error = err.message;
    } finally {
      this._saving = false;
    }
  }

  /** @param {{id: number, alias_name: string}} alias */
  _confirmDelete(alias) {
    this._pendingDelete = alias;
  }

  async _executeDelete() {
    const alias = this._pendingDelete;
    this._pendingDelete = null;
    if (!alias) return;
    this._error = '';
    this._message = '';
    try {
      await this.#api.deleteAlias(alias.id);
      this._message = `Alias "${alias.alias_name}" eliminado`;
      await this._loadData();
    } catch (err) {
      this._error = err.message;
    }
  }

  // ── Folder browser ─────────────────────────────────

  _toggleBrowse() {
    this._browsing = !this._browsing;
    if (this._browsing) {
      if (this._form.real_path) {
        this._browseInto(this._form.real_path);
      } else {
        // Show volume selection
        this._browsePath = '';
        this._browseItems = [];
      }
    }
  }

  /** @param {string} path */
  async _browseInto(path) {
    this._browsePath = path;
    this._browseLoading = true;
    try {
      const data = await this.#api.listDirectory(path, { limit: 200 });
      this._browseItems = data.items;
    } catch {
      this._browseItems = [];
    } finally {
      this._browseLoading = false;
    }
  }

  _browseUp() {
    const parent = this._browsePath.substring(0, this._browsePath.lastIndexOf('/'));
    // If current path is a volume root or parent is empty, go back to volume list
    const isVolumeRoot = this._volumes.some(v => v.virtual_path === this._browsePath);
    if (isVolumeRoot || !parent) {
      this._browsePath = '';
      this._browseItems = [];
    } else {
      this._browseInto(parent);
    }
  }

  // ── Group permissions ──────────────────────────────

  /** @param {{id: number}} alias */
  async _togglePermissions(alias) {
    if (this._expandedAlias === alias.id) {
      this._expandedAlias = null;
      return;
    }
    this._expandedAlias = alias.id;
    try {
      const data = await this.#api.getFolderPermissions(alias.id);
      this._permissions = data.permissions;
    } catch (err) {
      this._error = err.message;
    }
  }

  /**
   * @param {number} aliasId
   * @param {number} groupId
   * @param {string} field
   * @param {boolean} value
   */
  async _updatePerm(aliasId, groupId, field, value) {
    try {
      const existing = this._permissions.find(p => p.group_id === groupId);
      await this.#api.setFolderPermission({
        alias_id: aliasId,
        group_id: groupId,
        can_read: field === 'can_read' ? value : existing?.can_read ?? false,
        can_write: field === 'can_write' ? value : existing?.can_write ?? false,
        can_delete: field === 'can_delete' ? value : existing?.can_delete ?? false,
        can_move: field === 'can_move' ? value : existing?.can_move ?? false,
      });
      const data = await this.#api.getFolderPermissions(aliasId);
      this._permissions = data.permissions;
    } catch (err) {
      this._error = err.message;
    }
  }

  /** @param {number} aliasId */
  async _addPerm(aliasId) {
    const select = this.renderRoot.querySelector('#add-group-select');
    if (!select) return;
    const groupId = Number(/** @type {HTMLSelectElement} */ (select).value);
    if (!groupId) return;
    try {
      await this.#api.setFolderPermission({ alias_id: aliasId, group_id: groupId, can_read: true });
      const data = await this.#api.getFolderPermissions(aliasId);
      this._permissions = data.permissions;
      await this._loadData();
    } catch (err) {
      this._error = err.message;
    }
  }

  /**
   * @param {number} aliasId
   * @param {number} groupId
   */
  async _removePerm(aliasId, groupId) {
    try {
      await this.#api.deleteFolderPermission(aliasId, groupId);
      const data = await this.#api.getFolderPermissions(aliasId);
      this._permissions = data.permissions;
      await this._loadData();
    } catch (err) {
      this._error = err.message;
    }
  }
}

customElements.define('gd-admin-aliases', GdAdminAliases);
