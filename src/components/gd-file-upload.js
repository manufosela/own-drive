import { LitElement, html, css } from 'lit';
import { ChunkedUploader } from '../lib/upload-client.js';

/**
 * @typedef {import('../lib/upload-client.js').UploadProgress} UploadProgress
 */

/**
 * Upload status for a single file in the queue.
 * @typedef {object} FileUploadEntry
 * @property {File} file
 * @property {'pending'|'uploading'|'done'|'error'} status
 * @property {number} percent
 * @property {string} [error]
 */

export class GdFileUpload extends LitElement {
  static properties = {
    path: { type: String },
    _dragOver: { state: true },
    _queue: { state: true },
    _uploading: { state: true },
  };

  constructor() {
    super();
    /** Virtual path of the current directory (upload destination). */
    this.path = '/';
    /** Whether the drop zone is in drag-over state. */
    this._dragOver = false;
    /** @type {FileUploadEntry[]} */
    this._queue = [];
    /** @type {boolean} */
    this._uploading = false;
  }

  /** @type {ChunkedUploader} */
  #uploader = new ChunkedUploader();

  static styles = css`
    :host {
      display: block;
    }

    .drop-zone {
      display: flex;
      align-items: center;
      gap: 10px;
      border: 1.5px dashed var(--color-border, #dadce0);
      border-radius: var(--radius, 8px);
      padding: 11px 16px;
      min-height: 44px;
      box-sizing: border-box;
      transition: border-color 0.2s, background 0.2s;
      cursor: pointer;
    }

    .drop-zone:hover {
      border-color: var(--color-primary, #1a73e8);
      background: rgba(26, 115, 232, 0.03);
    }

    .drop-zone.drag-over {
      border-color: var(--color-primary, #1a73e8);
      background: rgba(26, 115, 232, 0.06);
    }

    .drop-zone-icon {
      width: 22px;
      height: 22px;
      flex-shrink: 0;
      color: var(--color-text-secondary, #5f6368);
    }

    .drop-zone.drag-over .drop-zone-icon {
      color: var(--color-primary, #1a73e8);
    }

    .drop-zone-text {
      flex: 1;
      font-size: 13px;
      color: var(--color-text-secondary, #5f6368);
    }

    .drop-zone-text strong {
      color: var(--color-primary, #1a73e8);
      cursor: pointer;
    }

    .upload-queue {
      margin-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .upload-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 12px;
      background: var(--color-surface, #fff);
      border: 1px solid var(--color-border, #dadce0);
      border-radius: var(--radius, 8px);
      font-size: 12px;
    }

    .upload-item-name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--color-text, #202124);
    }

    .upload-item-size {
      color: var(--color-text-secondary, #5f6368);
      white-space: nowrap;
    }

    .upload-item-status {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }

    .progress-bar {
      flex: 0 0 100px;
      height: 3px;
      background: var(--color-border, #dadce0);
      border-radius: 2px;
      overflow: hidden;
    }

    .progress-bar-fill {
      height: 100%;
      background: var(--color-primary, #1a73e8);
      transition: width 0.2s ease;
    }

    .progress-bar-fill.done {
      background: var(--color-success, #34a853);
    }

    .progress-bar-fill.error {
      background: var(--color-error, #ea4335);
    }

    .upload-item-percent {
      width: 32px;
      text-align: right;
      font-size: 11px;
      color: var(--color-text-secondary, #5f6368);
    }

    .error-text {
      color: var(--color-error, #ea4335);
      font-size: 11px;
    }

    input[type="file"] {
      display: none;
    }

    :host *:focus-visible {
      outline: 2px solid var(--color-primary, #1a73e8);
      outline-offset: 2px;
    }

    @media (prefers-reduced-motion: reduce) {
      .drop-zone,
      .progress-bar-fill {
        transition: none;
      }
    }
  `;

  render() {
    return html`
      <div
        class="drop-zone ${this._dragOver ? 'drag-over' : ''}"
        role="button"
        aria-label="Arrastra ficheros aquí o haz clic para seleccionar"
        tabindex="0"
        @dragover=${this._onDragOver}
        @dragleave=${this._onDragLeave}
        @drop=${this._onDrop}
        @click=${this._openFilePicker}
        @keydown=${this._onDropZoneKeydown}
      >
        <svg class="drop-zone-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/>
        </svg>
        <span class="drop-zone-text">
          Arrastra ficheros aquí o <strong>selecciona</strong>
        </span>
      </div>

      <input
        type="file"
        multiple
        aria-label="Seleccionar ficheros para subir"
        @change=${this._onFileSelected}
      />

      ${this._queue.length > 0 ? html`
        <div class="upload-queue" aria-busy="${this._uploading}">
          ${this._queue.map((entry, i) => html`
            <div class="upload-item">
              <span class="upload-item-name" title="${entry.file.name}">${entry.file.name}</span>
              <span class="upload-item-size">${this._formatSize(entry.file.size)}</span>
              ${entry.status === 'uploading' || entry.status === 'done' || entry.status === 'error' ? html`
                <div class="progress-bar"
                  role="progressbar"
                  aria-valuenow="${entry.percent}"
                  aria-valuemin="0"
                  aria-valuemax="100"
                >
                  <div
                    class="progress-bar-fill ${entry.status}"
                    style="width: ${entry.percent}%"
                  ></div>
                </div>
                <span class="upload-item-percent">${entry.percent}%</span>
              ` : ''}
              ${entry.status === 'error' ? html`
                <span class="error-text">${entry.error}</span>
              ` : ''}
            </div>
          `)}
        </div>
      ` : ''}
    `;
  }

  /**
   * @param {DragEvent} e
   */
  _onDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    this._dragOver = true;
  }

  /**
   * @param {DragEvent} e
   */
  _onDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    this._dragOver = false;
  }

  /**
   * @param {DragEvent} e
   */
  _onDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    this._dragOver = false;

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      this._addFiles(Array.from(files));
    }
  }

  _openFilePicker() {
    const input = this.renderRoot.querySelector('input[type="file"]');
    if (input) input.click();
  }

  /**
   * @param {KeyboardEvent} e
   */
  _onDropZoneKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this._openFilePicker();
    }
  }

  /**
   * @param {Event} e
   */
  _onFileSelected(e) {
    const input = /** @type {HTMLInputElement} */ (e.target);
    if (input.files && input.files.length > 0) {
      this._addFiles(Array.from(input.files));
      input.value = '';
    }
  }

  /**
   * @param {File[]} files
   */
  _addFiles(files) {
    const entries = files.map(file => ({
      file,
      status: /** @type {const} */ ('pending'),
      percent: 0,
    }));

    this._queue = [...this._queue, ...entries];
    this._processQueue();
  }

  async _processQueue() {
    if (this._uploading) return;
    this._uploading = true;

    for (let i = 0; i < this._queue.length; i++) {
      if (this._queue[i].status !== 'pending') continue;

      this._updateEntry(i, { status: 'uploading', percent: 0 });

      const entry = this._queue[i];
      const destPath = this.path.endsWith('/')
        ? `${this.path}${entry.file.name}`
        : `${this.path}/${entry.file.name}`;

      const result = await this.#uploader.upload(entry.file, destPath, {
        onProgress: (progress) => {
          this._updateEntry(i, { percent: progress.percent });
        },
      });

      if (result.success) {
        this._updateEntry(i, { status: 'done', percent: 100 });
      } else {
        this._updateEntry(i, { status: 'error', error: result.error });
      }
    }

    this._uploading = false;

    // Notify parent that uploads finished
    const completed = this._queue.filter(e => e.status === 'done');
    if (completed.length > 0) {
      this.dispatchEvent(new CustomEvent('upload-complete', {
        bubbles: true,
        composed: true,
        detail: { count: completed.length, path: this.path },
      }));
    }
  }

  /**
   * @param {number} index
   * @param {Partial<FileUploadEntry>} updates
   */
  _updateEntry(index, updates) {
    this._queue = this._queue.map((entry, i) =>
      i === index ? { ...entry, ...updates } : entry,
    );
  }

  /**
   * @param {number} bytes
   * @returns {string}
   */
  _formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
}

customElements.define('gd-file-upload', GdFileUpload);
