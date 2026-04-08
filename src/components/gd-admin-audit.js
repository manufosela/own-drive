import { LitElement, html, css, nothing } from 'lit';
import { ApiClient } from '../lib/api-client.js';

const ACTION_LABELS = {
  access: 'Acceso a carpeta',
  login: 'Inicio de sesion',
  logout: 'Cierre de sesion',
  logout_all: 'Cierre en todos los dispositivos',
  download: 'Descargar',
  upload: 'Subir',
  delete: 'Eliminar',
  move: 'Mover',
  rename: 'Renombrar',
  mkdir: 'Crear carpeta',
  download_zip: 'Descargar ZIP',
};

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function shiftDay(dateStr, delta) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return d.toISOString().split('T')[0];
}

function formatDayLabel(dateStr) {
  const today = todayISO();
  if (dateStr === today) return 'Hoy';
  const yesterday = shiftDay(today, -1);
  if (dateStr === yesterday) return 'Ayer';
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-ES', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
  } catch {
    return dateStr;
  }
}

export class GdAdminAudit extends LitElement {
  static properties = {
    _entries: { state: true },
    _total: { state: true },
    _page: { state: true },
    _pages: { state: true },
    _loading: { state: true },
    _error: { state: true },
    _users: { state: true },
    _filters: { state: true },
    _day: { state: true },
    _aliases: { state: true },
  };

  constructor() {
    super();
    this._entries = [];
    this._total = 0;
    this._page = 1;
    this._pages = 0;
    this._loading = true;
    this._error = '';
    this._users = [];
    this._day = todayISO();
    this._filters = { user_id: '', action: '' };
    /** @type {Array<{alias_name: string, real_path: string}>} */
    this._aliases = [];
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
    .error-banner { padding: 12px; background: var(--color-error-bg, #fce8e6); color: var(--color-error-text, #c5221f); border-radius: 8px; margin-bottom: 16px; font-size: 13px; word-wrap: break-word; overflow-wrap: break-word; }
    .day-nav { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
    .day-nav button { background: none; border: 1px solid var(--color-border, #dadce0); border-radius: 4px; padding: 10px 14px; cursor: pointer; font-size: 14px; color: var(--color-text, #202124); display: flex; align-items: center; min-width: 40px; min-height: 40px; justify-content: center; }
    .day-nav button:hover { background: var(--color-hover, #f1f3f4); }
    .day-nav button:disabled { opacity: 0.4; cursor: not-allowed; }
    .day-label { font-size: 15px; font-weight: 500; color: var(--color-text, #202124); min-width: 200px; text-align: center; }
    .filters { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; align-items: flex-end; }
    .filter-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .filter-field label { font-size: 11px; color: var(--color-text-secondary, #5f6368); font-weight: 500; }
    .filter-field select { padding: 6px 8px; border: 1px solid var(--color-border, #dadce0); border-radius: 4px; font-size: 13px; font-family: inherit; background: var(--color-surface, #fff); color: var(--color-text, #202124); }
    .btn { padding: 10px 18px; border: none; border-radius: 4px; font-size: 13px; font-family: inherit; cursor: pointer; }
    .btn-secondary { background: transparent; color: var(--color-text-secondary); border: 1px solid var(--color-border, #dadce0); }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 8px 10px; border-bottom: 2px solid var(--color-border, #dadce0); color: var(--color-text-secondary, #5f6368); font-weight: 500; font-size: 12px; white-space: nowrap; }
    td { padding: 6px 10px; border-bottom: 1px solid var(--color-border-light, #e8eaed); overflow: hidden; text-overflow: ellipsis; }
    tr:hover td { background: rgba(0,0,0,0.02); }
    .mono { font-family: monospace; font-size: 12px; word-break: break-all; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 300px; }
    .action-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 500; background: var(--color-bg, #f1f3f4); color: var(--color-text, #202124); }
    .alias-name { color: var(--color-primary, #1a73e8); font-weight: 500; }
    .pagination { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 0; font-size: 13px; }
    .pagination button { background: none; border: 1px solid var(--color-border); border-radius: 4px; padding: 10px 18px; cursor: pointer; font-size: 13px; }
    .pagination button:disabled { opacity: 0.4; cursor: not-allowed; }
    .loading { text-align: center; padding: 40px; color: var(--color-text-secondary); }
    .empty { text-align: center; padding: 32px; color: var(--color-text-secondary); font-size: 14px; }
  `;

  connectedCallback() {
    super.connectedCallback();
    this._loadUsers();
    this._loadAliases();
    this._loadEntries();
  }

  async _loadUsers() {
    try {
      const data = await this.#api.getUsers();
      this._users = data.users;
    } catch { /* ignore */ }
  }

  async _loadAliases() {
    try {
      const data = await this.#api.getAdminAliases();
      this._aliases = data.aliases;
    } catch { /* ignore */ }
  }

  async _loadEntries() {
    this._loading = true;
    this._error = '';
    try {
      const data = await this.#api.getAuditLog({
        page: this._page,
        limit: 50,
        from: this._day,
        to: this._day,
        ...this._filters,
      });
      this._entries = data.entries;
      this._total = data.total;
      this._pages = data.pages;
    } catch (err) {
      this._error = err.message;
    } finally {
      this._loading = false;
    }
  }

  render() {
    return html`
      ${this._error ? html`<div class="error-banner" aria-live="polite">${this._error}</div>` : nothing}
      <div class="header"><h2>Registro de actividad</h2></div>
      ${this._renderDayNav()}
      ${this._renderFilters()}
      ${this._loading
        ? html`<div class="loading" aria-busy="true">Cargando...</div>`
        : this._entries.length === 0
          ? html`<div class="empty">No hay actividad registrada este día</div>`
          : html`
              ${this._renderTable()}
              ${this._pages > 1 ? this._renderPagination() : nothing}
            `}
    `;
  }

  _renderDayNav() {
    const isToday = this._day === todayISO();
    return html`
      <div class="day-nav">
        <button @click=${() => this._changeDay(-1)} title="Día anterior" aria-label="Día anterior">&#9664;</button>
        <span class="day-label">${formatDayLabel(this._day)}</span>
        <button @click=${() => this._changeDay(1)} ?disabled=${isToday} title="Día siguiente" aria-label="Día siguiente">&#9654;</button>
      </div>
    `;
  }

  _renderFilters() {
    return html`
      <div class="filters">
        <div class="filter-field">
          <label>Usuario</label>
          <select .value=${this._filters.user_id}
            @change=${e => { this._filters = { ...this._filters, user_id: e.target.value }; this._page = 1; this._loadEntries(); }}>
            <option value="">Todos</option>
            ${this._users.map(u => html`<option value=${u.id}>${u.display_name}</option>`)}
          </select>
        </div>
        <div class="filter-field">
          <label>Accion</label>
          <select .value=${this._filters.action}
            @change=${e => { this._filters = { ...this._filters, action: e.target.value }; this._page = 1; this._loadEntries(); }}>
            <option value="">Todas</option>
            ${Object.entries(ACTION_LABELS).map(([k, v]) => html`<option value=${k}>${v}</option>`)}
          </select>
        </div>
        <button class="btn btn-secondary" @click=${() => { this._filters = { user_id: '', action: '' }; this._page = 1; this._loadEntries(); }}>Limpiar filtros</button>
      </div>
    `;
  }

  _renderTable() {
    return html`
      <table>
        <thead><tr><th scope="col">Hora</th><th scope="col">Usuario</th><th scope="col">Accion</th><th scope="col">Ruta</th></tr></thead>
        <tbody>
          ${this._entries.map(e => html`
            <tr>
              <td style="white-space: nowrap">${this._formatTime(e.created_at)}</td>
              <td>${e.user_name || '-'}</td>
              <td><span class="action-badge">${ACTION_LABELS[e.action] || e.action}</span></td>
              <td class="mono">${this._formatPath(e.path)}${e.target_path ? html` &rarr; ${this._formatPath(e.target_path)}` : nothing}</td>
            </tr>
          `)}
        </tbody>
      </table>
      <div style="font-size: 12px; color: var(--color-text-secondary); padding: 8px 0;">
        ${this._total} registro${this._total !== 1 ? 's' : ''}
      </div>
    `;
  }

  _renderPagination() {
    return html`
      <div class="pagination">
        <button ?disabled=${this._page <= 1} @click=${() => { this._page--; this._loadEntries(); }} aria-label="Página anterior">Anterior</button>
        <span>${this._page} / ${this._pages}</span>
        <button ?disabled=${this._page >= this._pages} @click=${() => { this._page++; this._loadEntries(); }} aria-label="Página siguiente">Siguiente</button>
      </div>
    `;
  }

  /** @param {number} delta */
  _changeDay(delta) {
    this._day = shiftDay(this._day, delta);
    this._page = 1;
    this._loadEntries();
  }

  /**
   * Replace real NAS path with alias name + relative path.
   * @param {string} realPath
   * @returns {string}
   */
  _formatPath(realPath) {
    for (const a of this._aliases) {
      if (realPath === a.real_path || realPath.startsWith(a.real_path + '/')) {
        const relative = realPath.slice(a.real_path.length);
        return `${a.alias_name}${relative || '/'}`;
      }
    }
    return realPath;
  }

  _formatTime(iso) {
    try {
      return new Date(iso).toLocaleString('es-ES', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    } catch {
      return iso;
    }
  }
}

customElements.define('gd-admin-audit', GdAdminAudit);
