import { LitElement, html, css, nothing } from 'lit';
import { ApiClient } from '../lib/api-client.js';
import { readPaginationFromUrl, buildPaginationUrl } from '../lib/pagination-url.js';

/**
 * @typedef {import('../lib/api-client.js').FileItem} FileItem
 */

/**
 * File explorer component with breadcrumbs, table listing, column sorting
 * and pagination. Consumes the GET /api/files endpoint via ApiClient.
 *
 * @fires navigate - When the user navigates to a different directory
 */
export class GdFileExplorer extends LitElement {
  static properties = {
    path: { type: String },
    aliasRoot: { type: String, attribute: 'alias-root' },
    aliasName: { type: String, attribute: 'alias-name' },
    _items: { state: true },
    _total: { state: true },
    _page: { state: true },
    _pages: { state: true },
    _limit: { state: true },
    _loading: { state: true },
    _error: { state: true },
    _sortBy: { state: true },
    _sortDir: { state: true },
    _expandedDirs: { state: true },
    _treeChildren: { state: true },
    _loadingDirs: { state: true },
    _treeTotals: { state: true },
    _presenceMap: { state: true },
    _localSearchQuery: { state: true },
    _localSearchMode: { state: true },
    _localSearchResults: { state: true },
    _localSearching: { state: true },
    _showLocalResults: { state: true },
    _previewFile: { state: true },
    _cbctFolderPaths: { state: true },
    _permissions: { state: true },
    _selectedPaths: { state: true },
    _lastCheckedIndex: { state: true },
    _showMkdirDialog: { state: true },
    _mkdirName: { state: true },
    _showDeleteDialog: { state: true },
    _showMoveDialog: { state: true },
    _moveBrowsePath: { state: true },
    _moveBrowseItems: { state: true },
    _moveBrowseLoading: { state: true },
    _operationInProgress: { state: true },
    _stlDualFiles: { state: true },
    _textContent: { state: true },
    _textLoading: { state: true },
    _showAnonymizeModal: { state: true },
    _anonymizePath: { state: true },
    _anonymizeData: { state: true },
    _anonymizeConfig: { state: true },
    _anonymizeLoading: { state: true },
    _anonymizeError: { state: true },
    _anonymizeSelectedTable: { state: true },
    _anonymizeResult: { state: true },
    _epubBook: { state: true },
    _comicPages: { state: true },
    _comicCurrentPage: { state: true },
    _inlineVideoFile: { state: true },
  };

  constructor() {
    super();
    /** Current virtual path. */
    this.path = '/datosnas';
    /** Alias root path (e.g. /datosnas/dept/stls). Empty string = no alias context. */
    this.aliasRoot = '';
    /** Display name for the alias root (e.g. "Proyectos STL"). */
    this.aliasName = '';
    /** @type {FileItem[]} */
    this._items = [];
    /** @type {number} */
    this._total = 0;
    /** @type {number} */
    this._page = 1;
    /** @type {number} */
    this._pages = 0;
    /** @type {number} */
    this._limit = 50;
    /** @type {boolean} */
    this._loading = false;
    /** @type {string|null} */
    this._error = null;
    /** @type {'name'|'size'|'modified'} */
    this._sortBy = 'name';
    /** @type {'asc'|'desc'} */
    this._sortDir = 'asc';
    /** @type {Set<string>} Paths of expanded directories */
    this._expandedDirs = new Set();
    /** @type {Map<string, FileItem[]>} Cached children per directory path */
    this._treeChildren = new Map();
    /** @type {Set<string>} Directories currently loading */
    this._loadingDirs = new Set();
    /** @type {Map<string, number>} Total child count per directory path */
    this._treeTotals = new Map();
    /** @type {Object<string, Array<{user_id: number, display_name: string}>>} Presence by child path */
    this._presenceMap = {};
    /** @type {number|null} Heartbeat interval ID */
    this._heartbeatTimer = null;
    /** @type {string} Local search query */
    this._localSearchQuery = '';
    /** @type {'contains'|'starts'|'ends'} Local search mode */
    this._localSearchMode = 'contains';
    /** @type {Array<{name: string, type: string, size: number, modified: string, path: string}>} */
    this._localSearchResults = [];
    /** @type {boolean} */
    this._localSearching = false;
    /** @type {boolean} */
    this._showLocalResults = false;
    /** @type {number|null} */
    this._localDebounceTimer = null;
    /** @type {FileItem|null} File currently being previewed */
    this._previewFile = null;
    /** @type {Set<string>} Folder paths known to contain .dcm files */
    this._cbctFolderPaths = new Set();
    /** @type {object|null} CBCT series state (slices, current index, etc.) */
    this._cbctState = null;
    /** @type {{read: boolean, write: boolean, delete: boolean, move: boolean}} */
    this._permissions = { read: true, write: false, delete: false, move: false };
    /** @type {Set<string>} Selected file/folder paths */
    this._selectedPaths = new Set();
    /** @type {number} Last checked index for shift-click range selection */
    this._lastCheckedIndex = -1;
    /** @type {boolean} */
    this._showMkdirDialog = false;
    /** @type {string} */
    this._mkdirName = '';
    /** @type {boolean} */
    this._showDeleteDialog = false;
    /** @type {boolean} */
    this._showMoveDialog = false;
    /** @type {string} */
    this._moveBrowsePath = '';
    /** @type {FileItem[]} */
    this._moveBrowseItems = [];
    /** @type {boolean} */
    this._moveBrowseLoading = false;
    /** @type {boolean} */
    this._operationInProgress = false;
    /** @type {FileItem[]|null} Two STL files for dual viewer */
    this._stlDualFiles = null;
    /** @type {string|null} Fetched text content for text file preview */
    this._textContent = null;
    /** @type {boolean} Whether text content is being fetched */
    this._textLoading = false;
    /** @type {boolean} */
    this._showAnonymizeModal = false;
    /** @type {string|null} Path of file being anonymized */
    this._anonymizePath = null;
    /** @type {object|null} Parsed file data (columns, sampleRows, tables) */
    this._anonymizeData = null;
    /** @type {Array<{name: string, strategy: string, fakerType?: string}>} */
    this._anonymizeConfig = [];
    /** @type {boolean} */
    this._anonymizeLoading = false;
    /** @type {string|null} */
    this._anonymizeError = null;
    /** @type {string|null} Selected table name for SQL files */
    this._anonymizeSelectedTable = null;
    /** @type {object|null} Result after anonymization */
    this._anonymizeResult = null;
    /** @type {object|null} epub.js Book instance */
    this._epubBook = null;
    /** @type {Array<{name: string}>} Comic pages list */
    this._comicPages = [];
    /** @type {number} Current comic page index */
    this._comicCurrentPage = 0;
    /** @type {FileItem|null} Video playing inline below the file list */
    this._inlineVideoFile = null;
  }

  /** @type {ApiClient} */
  #api = new ApiClient();


  static styles = css`
    :host {
      display: block;
      max-height: calc(100vh - 120px);
      overflow: auto;
    }

    :host *:focus-visible {
      outline: 2px solid var(--color-primary, #1a73e8);
      outline-offset: 2px;
    }
    input[type="checkbox"]:focus-visible {
      outline: 2px solid var(--color-primary, #1a73e8);
      outline-offset: 2px;
    }

    /* Breadcrumbs */
    .breadcrumbs {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 8px 0;
      font-size: 14px;
      color: var(--color-text-secondary, #5f6368);
      flex-wrap: wrap;
    }

    .breadcrumbs button {
      background: none;
      border: none;
      padding: 8px 10px;
      border-radius: 4px;
      cursor: pointer;
      color: var(--color-primary, #1a73e8);
      font-size: 14px;
      font-family: inherit;
    }

    .breadcrumbs button:hover {
      background: rgba(26, 115, 232, 0.08);
    }

    .breadcrumbs button:last-child {
      color: var(--color-text, #202124);
      font-weight: 500;
      cursor: default;
    }

    .breadcrumbs button:last-child:hover {
      background: none;
    }

    .breadcrumbs .separator {
      color: var(--color-text-secondary, #5f6368);
      user-select: none;
    }

    /* Toolbar */
    .toolbar {
      display: flex;
      align-items: center;
      padding: 4px 0;
    }

    .expand-collapse-btn {
      background: none;
      border: 1px solid var(--color-border, #dadce0);
      border-radius: 4px;
      padding: 4px 10px;
      cursor: pointer;
      font-size: 12px;
      font-family: inherit;
      color: var(--color-text-secondary, #5f6368);
      white-space: nowrap;
    }

    .expand-collapse-btn:hover {
      background: rgba(0, 0, 0, 0.04);
      color: var(--color-text, #202124);
    }

    /* Table */
    .file-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    .file-table th {
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid var(--color-border, #dadce0);
      color: var(--color-text-secondary, #5f6368);
      font-weight: 500;
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
    }

    .file-table th:hover {
      color: var(--color-text, #202124);
    }

    .file-table th .sort-arrow {
      margin-left: 4px;
      font-size: 11px;
    }

    .file-table td {
      padding: 8px 12px;
      border-bottom: 1px solid var(--color-border-light, #e8eaed);
      color: var(--color-text, #202124);
    }

    .file-table tr:hover td {
      background: rgba(0, 0, 0, 0.02);
    }

    .file-table .col-name {
      width: auto;
      max-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }

    .file-table .col-size {
      width: 100px;
      text-align: right;
    }

    .file-table .col-modified {
      width: 160px;
    }

    .file-name {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .file-name button {
      background: none;
      border: none;
      padding: 0;
      cursor: pointer;
      color: var(--color-text, #202124);
      font-size: 13px;
      font-family: inherit;
      text-align: left;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }

    .file-name button:hover {
      color: var(--color-primary, #1a73e8);
      text-decoration: underline;
    }

    .file-icon {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }

    .file-icon.directory {
      color: var(--color-text-secondary, #5f6368);
    }

    .file-icon.file {
      color: var(--color-text-secondary, #5f6368);
    }

    /* States */
    .loading, .error-message, .empty-message {
      padding: 32px 24px;
      text-align: center;
      color: var(--color-text-secondary, #5f6368);
      font-size: 14px;
    }

    .error-message {
      color: var(--color-error, #ea4335);
    }

    /* Pagination */
    .pagination {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px 0;
      font-size: 13px;
      color: var(--color-text-secondary, #5f6368);
    }

    .pagination button {
      background: none;
      border: 1px solid var(--color-border, #dadce0);
      border-radius: 4px;
      padding: 8px 14px;
      cursor: pointer;
      font-size: 13px;
      font-family: inherit;
      color: var(--color-text, #202124);
    }

    .pagination button:hover:not(:disabled) {
      background: rgba(0, 0, 0, 0.04);
    }

    .pagination button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .pagination select {
      border: 1px solid var(--color-border, #dadce0);
      border-radius: 4px;
      padding: 4px 6px;
      font-size: 13px;
      font-family: inherit;
      color: var(--color-text, #202124);
      background: var(--color-bg, #fff);
      cursor: pointer;
    }

    .spinner {
      display: inline-block;
      width: 24px;
      height: 24px;
      border: 3px solid var(--color-border, #dadce0);
      border-top-color: var(--color-primary, #1a73e8);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Tree view */
    .tree-toggle {
      width: 20px;
      height: 20px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      cursor: pointer;
      color: var(--color-text-secondary, #5f6368);
      flex-shrink: 0;
      border-radius: 4px;
      font-size: 10px;
      padding: 0;
    }

    .tree-toggle:hover {
      background: var(--color-hover, rgba(0, 0, 0, 0.04));
    }

    .tree-spacer {
      width: 20px;
      flex-shrink: 0;
    }

    .tree-more {
      color: var(--color-text-secondary, #5f6368);
      font-style: italic;
      font-size: 12px;
      padding: 4px 12px;
    }

    .mini-spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid var(--color-border, #dadce0);
      border-top-color: var(--color-primary, #1a73e8);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    /* Presence badge */
    .presence-badge {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 1px 6px;
      border-radius: 10px;
      background: var(--color-presence-bg, #e8f0fe);
      color: var(--color-presence-text, #1967d2);
      font-size: 11px;
      font-weight: 500;
      white-space: nowrap;
      margin-left: 6px;
      line-height: 1.4;
    }

    .presence-badge .presence-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--color-presence-dot, #34a853);
      flex-shrink: 0;
    }

    /* Breadcrumb bar with local search */
    .breadcrumb-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      position: sticky;
      top: 0;
      z-index: 11;
      background: var(--color-bg, #fff);
      padding-bottom: 4px;
    }

    .local-search-wrapper {
      position: relative;
      flex: 1;
      max-width: 480px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .local-search-mode {
      padding: 4px 6px;
      border: 1px solid var(--color-border, #dadce0);
      border-radius: 12px;
      font-size: 11px;
      font-family: inherit;
      background: var(--color-bg, #f1f3f4);
      color: var(--color-text, #202124);
      outline: none;
      cursor: pointer;
      flex-shrink: 0;
    }

    .local-search-mode:focus {
      border-color: var(--color-primary, #1a73e8);
    }

    .local-search-input-wrapper {
      position: relative;
      flex: 1;
      min-width: 0;
    }

    .local-search-input {
      width: 100%;
      padding: 5px 10px 5px 28px;
      border: 1px solid var(--color-border, #dadce0);
      border-radius: 16px;
      font-size: 12px;
      font-family: inherit;
      outline: none;
      background: var(--color-bg, #f1f3f4);
      color: var(--color-text, #202124);
      box-sizing: border-box;
    }

    .local-search-input:focus {
      background: var(--color-surface, #fff);
      border-color: var(--color-primary, #1a73e8);
      box-shadow: 0 1px 2px rgba(26, 115, 232, 0.2);
    }

    .local-search-icon {
      position: absolute;
      left: 8px;
      top: 50%;
      transform: translateY(-50%);
      width: 14px;
      height: 14px;
      color: var(--color-text-secondary, #5f6368);
      pointer-events: none;
    }

    .local-search-results {
      position: absolute;
      top: calc(100% + 4px);
      right: 0;
      left: 0;
      background: var(--color-surface, #fff);
      border: 1px solid var(--color-border, #dadce0);
      border-radius: var(--radius, 8px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      max-height: 300px;
      overflow-y: auto;
      z-index: 50;
      min-width: 300px;
    }

    .local-result-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 12px;
      color: var(--color-text, #202124);
      border-bottom: 1px solid var(--color-border-light, #e8eaed);
    }

    .local-result-item:last-child {
      border-bottom: none;
    }

    .local-result-item:hover {
      background: rgba(0, 0, 0, 0.04);
    }

    .local-result-name {
      font-weight: 500;
    }

    .local-result-path {
      color: var(--color-text-secondary, #5f6368);
      font-size: 11px;
      margin-left: auto;
      white-space: nowrap;
    }

    .local-search-empty {
      padding: 12px 10px;
      text-align: center;
      color: var(--color-text-secondary, #5f6368);
      font-size: 12px;
    }

    .local-result-icon {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
      color: var(--color-text-secondary, #5f6368);
    }

    /* Split-view layout */
    .split-view {
      display: flex;
      gap: 0;
      flex: 1;
      min-height: 60vh;
      overflow: hidden;
    }

    .split-view .file-list-area {
      flex: 1;
      min-width: 0;
      overflow: auto;
    }

    /* Preview side panel (desktop) */
    .preview-panel {
      width: 45%;
      min-width: 350px;
      max-width: 60%;
      border-left: 1px solid var(--color-border, #dadce0);
      display: flex;
      flex-direction: column;
      background: var(--color-surface, #fff);
      overflow: hidden;
    }

    .preview-panel .preview-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      border-bottom: 1px solid var(--color-border, #dadce0);
      background: var(--color-surface, #fff);
      flex-shrink: 0;
    }

    .preview-panel .preview-header .preview-title {
      flex: 1;
      font-size: 13px;
      font-weight: 500;
      color: var(--color-text, #202124);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .preview-panel .preview-header button {
      background: none;
      border: 1px solid var(--color-border, #dadce0);
      border-radius: 4px;
      padding: 4px 8px;
      cursor: pointer;
      font-size: 12px;
      font-family: inherit;
      color: var(--color-text, #202124);
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .preview-panel .preview-header button:hover {
      background: rgba(0, 0, 0, 0.04);
    }

    .preview-panel .preview-header button svg {
      width: 14px;
      height: 14px;
    }

    .preview-panel .preview-body {
      flex: 1;
      min-height: 400px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-bg, #f8f9fa);
    }

    .preview-panel .preview-body iframe {
      width: 100%;
      height: 100%;
      border: none;
    }

    .preview-panel .preview-body img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }

    .preview-panel .preview-body .preview-unsupported {
      text-align: center;
      color: var(--color-text-secondary, #5f6368);
      padding: 40px;
    }

    .preview-panel .preview-body .preview-unsupported svg {
      width: 48px;
      height: 48px;
      margin-bottom: 12px;
      color: var(--color-text-secondary, #5f6368);
    }

    .preview-panel .preview-body .preview-unsupported p {
      margin: 8px 0;
      font-size: 14px;
    }

    /* STL viewer */
    .stl-viewer {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .stl-viewer canvas {
      width: 100% !important;
      height: 100% !important;
    }

    .stl-legend {
      position: absolute;
      bottom: 8px;
      left: 8px;
      background: rgba(255, 255, 255, 0.9);
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 11px;
      line-height: 1.6;
      box-shadow: 0 1px 4px rgba(0,0,0,0.15);
      pointer-events: none;
      z-index: 1;
    }

    .stl-legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .stl-legend-color {
      width: 10px;
      height: 10px;
      border-radius: 2px;
      flex-shrink: 0;
    }

    .stl-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      color: var(--color-text-secondary, #5f6368);
      font-size: 13px;
    }

    /* Markdown viewer */
    .markdown-viewer {
      width: 100%;
      height: 100%;
      overflow: auto;
    }

    .markdown-content {
      padding: 24px;
      font-size: 14px;
      line-height: 1.6;
      color: var(--color-text, #202124);
      width: 100%;
      box-sizing: border-box;
    }

    .markdown-content h1,
    .markdown-content h2,
    .markdown-content h3,
    .markdown-content h4 {
      margin: 1.2em 0 0.6em;
      font-weight: 600;
      color: var(--color-text, #202124);
    }

    .markdown-content h1 { font-size: 1.6em; border-bottom: 1px solid var(--color-border, #dadce0); padding-bottom: 0.3em; }
    .markdown-content h2 { font-size: 1.3em; border-bottom: 1px solid var(--color-border, #dadce0); padding-bottom: 0.3em; }
    .markdown-content h3 { font-size: 1.1em; }

    .markdown-content p { margin: 0.8em 0; }

    .markdown-content code {
      background: var(--color-bg, #f1f3f4);
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 0.9em;
      font-family: 'Courier New', monospace;
    }

    .markdown-content pre {
      background: var(--color-bg, #f1f3f4);
      padding: 12px 16px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 1em 0;
    }

    .markdown-content pre code {
      background: none;
      padding: 0;
    }

    .markdown-content ul, .markdown-content ol {
      padding-left: 24px;
      margin: 0.8em 0;
    }

    .markdown-content li { margin: 0.3em 0; }

    .markdown-content table {
      border-collapse: collapse;
      width: 100%;
      margin: 1em 0;
    }

    .markdown-content th,
    .markdown-content td {
      border: 1px solid var(--color-border, #dadce0);
      padding: 8px 12px;
      text-align: left;
      font-size: 13px;
    }

    .markdown-content th {
      background: var(--color-bg, #f1f3f4);
      font-weight: 600;
    }

    .markdown-content blockquote {
      border-left: 3px solid var(--color-primary, #1a73e8);
      margin: 1em 0;
      padding: 4px 16px;
      color: var(--color-text-secondary, #5f6368);
    }

    .markdown-content a {
      color: var(--color-primary, #1a73e8);
      text-decoration: none;
    }

    .markdown-content a:hover { text-decoration: underline; }

    .markdown-content img {
      max-width: 100%;
      height: auto;
    }

    /* Text viewer */
    .text-viewer {
      width: 100%;
      height: 100%;
      overflow: auto;
      background: var(--color-bg, #f8f9fa);
      padding: 16px;
      margin: 0;
      font-family: 'Cascadia Code', 'Fira Code', 'SF Mono', 'Consolas', 'Monaco', monospace;
      font-size: 13px;
      line-height: 1.6;
      color: var(--color-text, #202124);
      white-space: pre-wrap;
      word-wrap: break-word;
      tab-size: 4;
      border: none;
      box-sizing: border-box;
    }

    .text-viewer-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--color-text-secondary, #5f6368);
      font-size: 13px;
      gap: 8px;
    }

    /* DICOM viewer */
    .dicom-viewer {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      background: var(--color-dicom-bg, #000);
    }

    .dicom-canvas-container {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .dicom-loading {
      position: absolute;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      color: var(--color-dicom-text, #ccc);
      font-size: 13px;
    }

    .dicom-hint {
      position: absolute;
      bottom: 8px;
      right: 12px;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.5);
      pointer-events: none;
    }

    /* EPUB viewer */
    .epub-viewer {
      width: 100%; height: 100%; display: flex; flex-direction: column; background: var(--color-surface, #fff);
    }
    .epub-viewer .epub-content {
      flex: 1; overflow: hidden; position: relative;
    }
    .epub-viewer .epub-nav {
      display: flex; align-items: center; justify-content: space-between; padding: 8px 12px;
      border-top: 1px solid var(--color-border, #dadce0); background: var(--color-bg, #f8f9fa);
    }
    .epub-viewer .epub-nav button {
      padding: 6px 16px; border: 1px solid var(--color-border, #dadce0); border-radius: 4px;
      background: var(--color-surface, #fff); color: var(--color-text, #202124);
      font-size: 13px; cursor: pointer;
    }
    .epub-viewer .epub-nav button:hover { background: var(--color-hover, #f1f3f4); }
    .epub-viewer .epub-nav button:disabled { opacity: 0.4; cursor: not-allowed; }
    .epub-viewer .epub-nav span { font-size: 12px; color: var(--color-text-secondary, #5f6368); }
    .epub-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; }

    /* Comic viewer (CBZ/CBR) */
    .comic-viewer {
      width: 100%; height: 100%; display: flex; flex-direction: column; background: #1a1a1a;
    }
    .comic-viewer .comic-page-container {
      flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative;
    }
    .comic-viewer .comic-page-container img {
      max-width: 100%; max-height: 100%; object-fit: contain;
    }
    .comic-viewer .comic-nav {
      display: flex; align-items: center; justify-content: space-between; padding: 8px 12px;
      border-top: 1px solid #333; background: #222;
    }
    .comic-viewer .comic-nav button {
      padding: 6px 16px; border: 1px solid #444; border-radius: 4px;
      background: #333; color: #eee; font-size: 13px; cursor: pointer;
    }
    .comic-viewer .comic-nav button:hover { background: #444; }
    .comic-viewer .comic-nav button:disabled { opacity: 0.3; cursor: not-allowed; }
    .comic-viewer .comic-nav span { font-size: 12px; color: #aaa; }
    .comic-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #aaa; }

    /* Inline video player */
    .inline-video {
      margin-top: 16px; border: 1px solid var(--color-border, #dadce0); border-radius: 8px;
      overflow: hidden; background: #000;
    }
    .inline-video .inline-video-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 12px; background: var(--color-surface, #fff);
      border-bottom: 1px solid var(--color-border, #dadce0);
    }
    .inline-video .inline-video-header span {
      font-size: 13px; font-weight: 500; color: var(--color-text, #202124);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .inline-video .inline-video-header button {
      background: none; border: none; cursor: pointer; padding: 4px;
      color: var(--color-text-secondary, #5f6368); border-radius: 4px;
    }
    .inline-video .inline-video-header button:hover { background: var(--color-hover, #f1f3f4); }
    .inline-video .inline-video-header button svg { width: 20px; height: 20px; }
    .inline-video video {
      width: 100%; max-height: 70vh; display: block;
    }

    .dicom-slice-indicator {
      position: absolute;
      top: 8px;
      left: 12px;
      font-size: 13px;
      color: rgba(255, 255, 255, 0.85);
      background: rgba(0, 0, 0, 0.5);
      padding: 4px 10px;
      border-radius: 4px;
      pointer-events: none;
      font-weight: 500;
      z-index: 2;
    }

    .dicom-slice-progress {
      position: absolute;
      top: 8px;
      right: 12px;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.6);
      background: rgba(0, 0, 0, 0.5);
      padding: 3px 8px;
      border-radius: 4px;
      pointer-events: none;
      z-index: 2;
    }

    .cbct-btn {
      background: none;
      border: 1px solid var(--color-primary, #1a73e8);
      border-radius: 4px;
      padding: 2px 8px;
      cursor: pointer;
      font-size: 11px;
      font-family: inherit;
      color: var(--color-primary, #1a73e8);
      white-space: nowrap;
      margin-left: 6px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .cbct-btn:hover {
      background: rgba(26, 115, 232, 0.08);
    }

    .cbct-btn svg {
      width: 14px;
      height: 14px;
    }

    /* Preview overlay (mobile fallback) */
    .preview-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.7);
      z-index: 1000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .preview-overlay .preview-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 20px;
      background: var(--color-surface, #fff);
      border-radius: 8px 8px 0 0;
      width: min(90vw, 1200px);
      box-sizing: border-box;
    }

    .preview-overlay .preview-header .preview-title {
      flex: 1;
      font-size: 14px;
      font-weight: 500;
      color: var(--color-text, #202124);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .preview-overlay .preview-header button {
      background: none;
      border: 1px solid var(--color-border, #dadce0);
      border-radius: 4px;
      padding: 6px 12px;
      cursor: pointer;
      font-size: 13px;
      font-family: inherit;
      color: var(--color-text, #202124);
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .preview-overlay .preview-header button:hover {
      background: rgba(0, 0, 0, 0.04);
    }

    .preview-overlay .preview-header button svg {
      width: 16px;
      height: 16px;
    }

    .preview-overlay .preview-body {
      background: var(--color-surface, #fff);
      width: min(90vw, 1200px);
      height: min(80vh, 900px);
      border-radius: 0 0 8px 8px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .preview-overlay .preview-body iframe {
      width: 100%;
      height: 100%;
      border: none;
    }

    .preview-overlay .preview-body img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }

    .preview-overlay .preview-body .preview-unsupported {
      text-align: center;
      color: var(--color-text-secondary, #5f6368);
      padding: 40px;
    }

    .preview-overlay .preview-body .preview-unsupported svg {
      width: 48px;
      height: 48px;
      margin-bottom: 12px;
      color: var(--color-text-secondary, #5f6368);
    }

    .preview-overlay .preview-body .preview-unsupported p {
      margin: 8px 0;
      font-size: 14px;
    }

    /* Row actions (hover) */
    .row-actions {
      display: none;
      align-items: center;
      gap: 2px;
      margin-left: auto;
      flex-shrink: 0;
    }

    tr:hover .row-actions {
      display: inline-flex;
    }

    .row-action-btn {
      background: none;
      border: none;
      padding: 8px;
      min-width: 32px;
      min-height: 32px;
      border-radius: 4px;
      cursor: pointer;
      color: var(--color-text-secondary, #5f6368);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .row-action-btn:hover {
      background: rgba(0, 0, 0, 0.08);
      color: var(--color-primary, #1a73e8);
    }

    .row-action-btn.copied {
      color: var(--color-success, #34a853);
    }

    .row-action-btn svg {
      width: 16px;
      height: 16px;
    }

    /* Selection checkboxes */
    .col-check { width: 32px; text-align: center; }
    .col-check input[type="checkbox"] { cursor: pointer; accent-color: var(--color-primary, #1a73e8); }

    /* Action toolbar — always visible, subtle when inactive */
    .action-toolbar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: var(--color-bg-secondary, #f1f3f4);
      color: var(--color-text-secondary, #5f6368);
      border-bottom: 1px solid var(--color-border, #dadce0);
      font-size: 13px;
      flex-wrap: wrap;
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .action-toolbar.has-selection {
      background: var(--color-primary, #1a73e8);
      color: #fff;
      border-bottom-color: var(--color-primary, #1a73e8);
    }

    .action-toolbar .selected-count {
      font-weight: 500;
      margin-right: auto;
    }

    .action-toolbar button {
      background: transparent;
      border: 1px solid var(--color-border, #dadce0);
      border-radius: 4px;
      padding: 8px 14px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      font-family: inherit;
      color: var(--color-text-secondary, #5f6368);
      display: flex;
      align-items: center;
      gap: 4px;
      transition: background 0.2s, opacity 0.2s;
    }

    .action-toolbar button:disabled {
      opacity: 0.4;
      cursor: default;
      pointer-events: none;
    }

    .action-toolbar.has-selection button {
      background: rgba(255,255,255,0.2);
      border-color: rgba(255,255,255,0.5);
      color: #fff;
    }

    .action-toolbar button:hover:not(:disabled) { background: rgba(0,0,0,0.06); }
    .action-toolbar.has-selection button:hover:not(:disabled) { background: rgba(255,255,255,0.35); }
    .action-toolbar button.danger { color: var(--color-error, #ea4335); border-color: var(--color-error, #ea4335); }
    .action-toolbar.has-selection button.danger { background: var(--color-error, #ea4335); border-color: var(--color-error, #ea4335); color: #fff; }
    .action-toolbar button.danger:hover:not(:disabled) { background: rgba(234,67,53,0.1); }
    .action-toolbar.has-selection button.danger:hover:not(:disabled) { background: var(--color-error-text, #c5221f); }

    .action-toolbar button svg { width: 14px; height: 14px; }

    .action-toolbar .deselect-btn {
      background: none;
      border: none;
      padding: 2px;
      margin-left: 4px;
    }
    .action-toolbar.has-selection .deselect-btn { color: rgba(255,255,255,0.8); }
    .action-toolbar .deselect-btn:hover:not(:disabled) { background: none; opacity: 0.7; }

    .folder-toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
    }

    .folder-toolbar button {
      background: none;
      border: 1px solid var(--color-border, #dadce0);
      border-radius: 4px;
      padding: 4px 12px;
      cursor: pointer;
      font-size: 12px;
      font-family: inherit;
      color: var(--color-text, #202124);
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .folder-toolbar button:hover { background: rgba(0,0,0,0.04); }
    .folder-toolbar button svg { width: 14px; height: 14px; }

    /* Modal overlay for dialogs */
    .modal-backdrop {
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.5);
      z-index: 2000;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .modal-dialog {
      background: var(--color-surface, #fff);
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      min-width: 360px;
      max-width: 500px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
    }

    .modal-dialog h3 {
      margin: 0;
      padding: 16px 20px;
      font-size: 16px;
      font-weight: 600;
      border-bottom: 1px solid var(--color-border, #dadce0);
    }

    .modal-dialog .modal-body {
      padding: 16px 20px;
      overflow-y: auto;
      flex: 1;
    }

    .modal-dialog .modal-body input[type="text"] {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid var(--color-border, #dadce0);
      border-radius: 4px;
      font-size: 14px;
      font-family: inherit;
      box-sizing: border-box;
      outline: none;
    }

    .modal-dialog .modal-body input:focus {
      border-color: var(--color-primary, #1a73e8);
      box-shadow: 0 0 0 2px rgba(26,115,232,0.2);
    }

    .modal-dialog .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 20px;
      border-top: 1px solid var(--color-border, #dadce0);
    }

    .modal-dialog .modal-footer button {
      padding: 6px 16px;
      border-radius: 4px;
      font-size: 13px;
      font-family: inherit;
      cursor: pointer;
      border: 1px solid var(--color-border, #dadce0);
      background: var(--color-surface, #fff);
      color: var(--color-text, #202124);
    }

    .modal-dialog .modal-footer button:hover { background: rgba(0,0,0,0.04); }

    .modal-dialog .modal-footer button.primary {
      background: var(--color-primary, #1a73e8);
      color: #fff;
      border-color: var(--color-primary, #1a73e8);
    }

    .modal-dialog .modal-footer button.primary:hover { background: var(--color-primary-dark, #1557b0); }
    .modal-dialog .modal-footer button.primary:disabled { opacity: 0.5; cursor: not-allowed; }

    .modal-dialog .modal-footer button.danger {
      background: var(--color-error, #ea4335);
      color: #fff;
      border-color: var(--color-error, #ea4335);
    }

    .modal-dialog .modal-footer button.danger:hover { background: var(--color-error-text, #c5221f); }

    /* Move dialog folder browser */
    .move-browser {
      border: 1px solid var(--color-border, #dadce0);
      border-radius: 4px;
      max-height: 300px;
      overflow-y: auto;
    }

    .move-browser-path {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 8px 12px;
      font-size: 12px;
      color: var(--color-text-secondary, #5f6368);
      border-bottom: 1px solid var(--color-border-light, #e8eaed);
      background: var(--color-bg, #f8f9fa);
    }

    .move-browser-path button {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--color-primary, #1a73e8);
      font-size: 12px;
      font-family: inherit;
      padding: 2px 4px;
      border-radius: 3px;
    }

    .move-browser-path button:hover { background: rgba(26,115,232,0.08); }

    .move-browser-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      cursor: pointer;
      font-size: 13px;
      border-bottom: 1px solid var(--color-border-light, #e8eaed);
    }

    .move-browser-item:hover { background: rgba(0,0,0,0.04); }
    .move-browser-item:last-child { border-bottom: none; }
    .move-browser-item svg { width: 16px; height: 16px; color: var(--color-text-secondary, #5f6368); flex-shrink: 0; }

    .move-dest-label {
      margin-top: 12px;
      font-size: 12px;
      color: var(--color-text-secondary, #5f6368);
    }

    .move-dest-label strong {
      color: var(--color-text, #202124);
    }

    .op-message {
      padding: 8px 0;
      font-size: 13px;
      color: var(--color-text, #202124);
    }

    .op-message .error-item {
      color: var(--color-error, #ea4335);
      font-size: 12px;
      margin-top: 4px;
    }

    /* Anonymize modal */
    .anon-modal { min-width: min(680px, 95vw); max-width: 90vw; }
    .anon-table-selector { margin-bottom: 12px; }
    .anon-table-selector select { padding: 4px 8px; border-radius: 4px; border: 1px solid var(--color-border, #dadce0); background: var(--color-surface, #fff); color: var(--color-text, #202124); font-size: 13px; }
    .anon-grid { width: 100%; border-collapse: collapse; font-size: 12px; }
    .anon-grid th, .anon-grid td { padding: 6px 8px; text-align: left; border-bottom: 1px solid var(--color-border, #dadce0); }
    .anon-grid th { background: var(--color-surface-variant, #f1f3f4); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-secondary, #5f6368); position: sticky; top: 0; z-index: 1; }
    .anon-grid td select { padding: 3px 6px; border-radius: 4px; border: 1px solid var(--color-border, #dadce0); background: var(--color-surface, #fff); color: var(--color-text, #202124); font-size: 12px; }
    .anon-grid .sample-cell { font-family: monospace; font-size: 11px; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-text-secondary, #5f6368); }
    .anon-grid .type-badge { display: inline-block; padding: 1px 6px; border-radius: 3px; background: var(--color-surface-variant, #f1f3f4); font-size: 10px; color: var(--color-text-secondary, #5f6368); }
    .anon-body { max-height: 60vh; overflow-y: auto; }
    .anon-result { padding: 12px 0; }
    .anon-result-success { color: var(--color-success, #34a853); }
    .anon-result-path { font-family: monospace; font-size: 12px; background: var(--color-surface-variant, #f1f3f4); padding: 4px 8px; border-radius: 4px; margin-top: 4px; display: inline-block; }
    .anon-stats { font-size: 12px; color: var(--color-text-secondary, #5f6368); margin-top: 8px; }
    .anon-header { display: flex; align-items: center; gap: 8px; }
    .anon-header h3 { margin: 0; flex: 1; }
    .anon-help-link { font-size: 12px; color: var(--color-primary, #1a73e8); text-decoration: none; display: flex; align-items: center; gap: 4px; }
    .anon-help-link:hover { text-decoration: underline; }
    .anon-error { color: var(--color-error, #ea4335); font-size: 13px; padding: 8px 0; }
  `;

  /**
   * Whether the current directory contains at least one folder.
   * @returns {boolean}
   */
  get _hasFolders() {
    return this._items.some(item => item.type === 'directory');
  }

  /**
   * Whether ALL top-level folders in the current page are expanded.
   * @returns {boolean}
   */
  get _allExpanded() {
    const dirs = this._items.filter(item => item.type === 'directory');
    return dirs.length > 0 && dirs.every(item => this._expandedDirs.has(item.path));
  }

  connectedCallback() {
    super.connectedCallback();
    const { page, pageSize } = readPaginationFromUrl(window.location.href);
    this._page = page;
    this._limit = pageSize;
    this._loadDirectory();
    this._startHeartbeat();
    this._onKeyDown = this._onKeyDown.bind(this);
    document.addEventListener('keydown', this._onKeyDown);
    this._onPopState = this._onPopState.bind(this);
    window.addEventListener('popstate', this._onPopState);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._stopHeartbeat();
    this._disposeStlViewer();
    this.#api.leavePresence().catch(() => {});
    document.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('popstate', this._onPopState);
  }

  /** @param {KeyboardEvent} e */
  _onKeyDown(e) {
    if (e.key === 'Escape' && this._previewFile) {
      this._closePreview();
    }
  }

  /** @param {Map<string, unknown>} changed */
  updated(changed) {
    if (changed.has('path') && changed.get('path') !== undefined) {
      this._page = 1;
      this._syncPaginationUrl();
      this._expandedDirs = new Set();
      this._treeChildren = new Map();
      this._loadingDirs = new Set();
      this._treeTotals = new Map();
      // Reset local search on folder change
      this._localSearchQuery = '';
      this._localSearchResults = [];
      this._showLocalResults = false;
      this._loadDirectory();
      this._sendHeartbeat();
    }
    if (changed.has('_previewFile') && this._previewFile) {
      const previewType = this._getPreviewType(this._previewFile.name);
      if (previewType === 'stl' || this._stlDualFiles) {
        this._disposeStlViewer();
        this.updateComplete.then(() => this._initStlViewer());
      } else if (previewType === 'markdown') {
        this.updateComplete.then(() => this._initMarkdownViewer());
      } else if (previewType === 'epub') {
        this.updateComplete.then(() => {
          const epubEl = this.renderRoot.querySelector('.epub-viewer');
          if (epubEl && !epubEl._initialized) {
            epubEl._initialized = true;
            this._initEpubViewer(epubEl);
          }
        });
      } else if (previewType === 'comic') {
        this.updateComplete.then(() => {
          const comicEl = this.renderRoot.querySelector('.comic-viewer');
          if (comicEl && !comicEl._initialized) {
            comicEl._initialized = true;
            this._initComicViewer(comicEl);
          }
        });
      } else if (previewType === 'dicom' || this._previewFile.type === 'cbct-folder') {
        this.updateComplete.then(() => this._initDicomViewer());
      } else if (previewType === 'text') {
        this._loadTextContent(this._previewFile);
      }
    }
  }

  /** @returns {boolean} Whether to use side panel (true) or overlay modal (false) */
  _usesSidePanel() {
    return window.innerWidth >= 768;
  }

  /** Whether selection checkboxes should be visible */
  get _hasManagePerms() {
    return this._permissions.write || this._permissions.delete || this._permissions.move;
  }

  render() {
    const hasSidePreview = this._previewFile && this._usesSidePanel();
    const hasOverlayPreview = this._previewFile && !this._usesSidePanel();

    const fileListContent = html`
      ${this._loading ? html`
        <div class="loading"><div class="spinner"></div></div>
      ` : this._error ? html`
        <div class="error-message">${this._error}</div>
      ` : this._items.length === 0 ? html`
        ${this._permissions.write ? html`
          <div class="folder-toolbar">
            <button @click=${() => { this._showMkdirDialog = true; this._mkdirName = ''; }}>
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10zm-8-4h2v2h2v-2h2v-2h-2v-2h-2v2h-2v2z"/></svg>
              Nueva carpeta
            </button>
          </div>
        ` : nothing}
        <div class="empty-message">Esta carpeta está vacía</div>
      ` : html`
        <div class="folder-toolbar">
          ${this._hasFolders ? html`
            <button
              class="expand-collapse-btn"
              @click=${this._allExpanded ? () => this._collapseAll() : () => this._expandAll()}
            >
              ${this._allExpanded ? '▼ Colapsar todos' : '▶ Expandir todos'}
            </button>
          ` : nothing}
          ${this._permissions.write ? html`
            <button @click=${() => { this._showMkdirDialog = true; this._mkdirName = ''; }}>
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10zm-8-4h2v2h2v-2h2v-2h-2v-2h-2v2h-2v2z"/></svg>
              Nueva carpeta
            </button>
          ` : nothing}
        </div>
        ${this._hasManagePerms ? this._renderActionToolbar() : nothing}
        ${this._pages > 1 ? this._renderPagination() : nothing}
        ${this._renderTable()}
        ${this._pages > 1 ? this._renderPagination() : nothing}
      `}
    `;

    return html`
      <div class="breadcrumb-bar" role="navigation" aria-label="Navegación de carpetas">
        ${this._renderBreadcrumbs()}
        ${this._renderLocalSearch()}
      </div>

      ${hasSidePreview ? html`
        <div class="split-view">
          <div class="file-list-area">${fileListContent}</div>
          ${this._renderPreviewPanel()}
        </div>
      ` : fileListContent}
      ${hasOverlayPreview ? this._renderPreviewOverlay() : nothing}
      ${this._showMkdirDialog ? this._renderMkdirDialog() : nothing}
      ${this._showDeleteDialog ? this._renderDeleteDialog() : nothing}
      ${this._showMoveDialog ? this._renderMoveDialog() : nothing}
      ${this._showAnonymizeModal ? this._renderAnonymizeModal() : nothing}
    `;
  }

  _renderBreadcrumbs() {
    const crumbs = this._buildCrumbs();

    return html`
      <nav class="breadcrumbs" aria-label="Ruta de navegación">
        ${crumbs.map((crumb, i) => html`
          ${i > 0 ? html`<span class="separator">/</span>` : nothing}
          <button
            @click=${() => this._navigateTo(crumb.path)}
            ?disabled=${i === crumbs.length - 1}
            aria-current=${i === crumbs.length - 1 ? 'page' : nothing}
          >${crumb.label}</button>
        `)}
      </nav>
    `;
  }

  /**
   * Build breadcrumb entries. When aliasRoot is set, the root crumb
   * shows the alias display name and sub-paths are relative to it.
   * @returns {Array<{label: string, path: string}>}
   */
  _buildCrumbs() {
    if (this.aliasRoot && this.path.startsWith(this.aliasRoot)) {
      const crumbs = [{ label: this.aliasName || this.aliasRoot, path: this.aliasRoot }];
      const relative = this.path.slice(this.aliasRoot.length).replace(/^\//, '');
      if (relative) {
        const parts = relative.split('/');
        for (let i = 0; i < parts.length; i++) {
          crumbs.push({
            label: parts[i],
            path: this.aliasRoot + '/' + parts.slice(0, i + 1).join('/'),
          });
        }
      }
      return crumbs;
    }

    const segments = this.path.split('/').filter(Boolean);
    return segments.map((seg, i) => ({
      label: seg,
      path: '/' + segments.slice(0, i + 1).join('/'),
    }));
  }

  _renderTable() {
    const showCheck = this._hasManagePerms;
    const allSelected = this._items.length > 0 && this._items.every(i => this._selectedPaths.has(i.path));

    return html`
      <table class="file-table">
        <thead>
          <tr>
            ${showCheck ? html`
              <th scope="col" class="col-check">
                <input type="checkbox" .checked=${allSelected}
                  @change=${(e) => this._toggleSelectAll(e.target.checked)}
                  aria-label="Seleccionar todo" />
              </th>
            ` : nothing}
            <th scope="col" class="col-name" role="columnheader"
              aria-sort="${this._sortBy === 'name' ? (this._sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}"
              @click=${() => this._toggleSort('name')}>
              Nombre ${this._renderSortArrow('name')}
            </th>
            <th scope="col" class="col-size" role="columnheader"
              aria-sort="${this._sortBy === 'size' ? (this._sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}"
              @click=${() => this._toggleSort('size')}>
              Tamaño ${this._renderSortArrow('size')}
            </th>
            <th scope="col" class="col-modified" role="columnheader"
              aria-sort="${this._sortBy === 'modified' ? (this._sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}"
              @click=${() => this._toggleSort('modified')}>
              Modificado ${this._renderSortArrow('modified')}
            </th>
          </tr>
        </thead>
        <tbody @click=${this._onTableClick}>
          ${this._renderRows(this._items, 0)}
        </tbody>
      </table>
    `;
  }

  /**
   * Recursively render rows for items at a given tree depth.
   * @param {FileItem[]} items
   * @param {number} depth
   * @returns {import('lit').TemplateResult[]}
   */
  _renderRows(items, depth) {
    const sorted = depth === 0 ? items : this._sortItems(items);

    return sorted.map(item => {
      const isDir = item.type === 'directory';
      const isExpanded = isDir && this._expandedDirs.has(item.path);
      const isLoading = isDir && this._loadingDirs.has(item.path);
      const children = this._treeChildren.get(item.path);
      const total = this._treeTotals.get(item.path) ?? 0;

      return html`
        <tr>
          ${this._hasManagePerms ? html`
            <td class="col-check">
              <input type="checkbox" .checked=${this._selectedPaths.has(item.path)}
                @click=${(e) => this._toggleSelect(item.path, e)}
                aria-label="Seleccionar ${item.name}" />
            </td>
          ` : nothing}
          <td class="col-name">
            <div class="file-name" style="padding-left: ${depth * 24}px">
              ${isDir ? html`
                <button
                  class="tree-toggle"
                  @click=${() => this._toggleExpand(item)}
                  aria-expanded="${isExpanded}"
                  aria-label="${isExpanded ? 'Contraer carpeta' : 'Expandir carpeta'}"
                >
                  ${isLoading
                    ? html`<span class="mini-spinner"></span>`
                    : isExpanded ? '▼' : '▶'}
                </button>
              ` : html`<span class="tree-spacer"></span>`}
              ${isDir
                ? html`<svg class="file-icon directory" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`
                : html`<svg class="file-icon file" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>`
              }
              ${isDir
                ? html`<button
                    @click=${() => this._navigateTo(item.path)}
                    title=${item.name}
                  >${item.name}</button>${this._renderPresenceBadge(item.path)}${this._cbctFolderPaths.has(item.path) ? html`
                    <button class="cbct-btn" @click=${(e) => { e.stopPropagation(); this._openCbctFolder(item.path); }} title="Ver como CBCT">
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM5 15h14v3H5z"/></svg>
                      CBCT
                    </button>
                  ` : nothing}`
                : html`<button @click=${() => this._openPreview(item)} title=${item.name}>${item.name}</button>`
              }
              <span class="row-actions">
                ${!isDir ? html`
                  <button class="row-action-btn" data-action="download" data-path=${item.path} title="Descargar">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                  </button>
                ` : nothing}
                ${!isDir && /\.(sql|csv)$/i.test(item.name) ? html`
                  <button class="row-action-btn" data-action="anonymize" data-path=${item.path} title="Anonimizar datos">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>
                  </button>
                ` : nothing}
                <button class="row-action-btn" data-action="copy-link" data-path=${item.path} data-type=${item.type} title="Copiar enlace">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
                </button>
                <button class="row-action-btn" data-action="shortcut" data-path=${item.path} data-type=${item.type} title="Crear alias">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 1H7c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-2-2-2zm0 18H7V5h10v14z"/></svg>
                </button>
              </span>
            </div>
          </td>
          <td class="col-size">${item.type === 'file' ? this._formatSize(item.size) : '--'}</td>
          <td class="col-modified">${this._formatDate(item.modified)}</td>
        </tr>
        ${this._inlineVideoFile && this._inlineVideoFile.path === item.path ? html`
          <tr>
            <td colspan="${this._hasManagePerms ? 4 : 3}" style="padding:0">
              ${this._renderInlineVideo()}
            </td>
          </tr>
        ` : nothing}
        ${isExpanded && children ? this._renderRows(children, depth + 1) : nothing}
        ${isExpanded && children && total > children.length ? html`
          <tr>
            <td colspan="3">
              <div class="tree-more" style="padding-left: ${(depth + 1) * 24 + 48}px">
                ${total - children.length} elemento${total - children.length !== 1 ? 's' : ''} más
              </div>
            </td>
          </tr>
        ` : nothing}
      `;
    });
  }

  /**
   * @param {'name'|'size'|'modified'} column
   * @returns {import('lit').TemplateResult|typeof nothing}
   */
  _renderSortArrow(column) {
    if (this._sortBy !== column) return nothing;
    return html`<span class="sort-arrow">${this._sortDir === 'asc' ? '▲' : '▼'}</span>`;
  }

  _renderPagination() {
    return html`
      <div class="pagination">
        <button ?disabled=${this._page <= 1} @click=${() => this._goToPage(this._page - 1)}>Anterior</button>
        <span>${this._page} / ${this._pages}</span>
        <button ?disabled=${this._page >= this._pages} @click=${() => this._goToPage(this._page + 1)}>Siguiente</button>
        <select .value=${String(this._limit)} @change=${this._onPageSizeChange}>
          <option value="25">25</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </select>
        <span>por pág.</span>
      </div>
    `;
  }

  async _loadDirectory() {
    this._loading = true;
    this._error = null;

    try {
      const data = await this.#api.listDirectory(this.path, {
        page: this._page,
        limit: this._limit,
        sortBy: this._sortBy,
        sortDir: this._sortDir,
      });

      this._items = data.items;
      this._total = data.total;
      this._pages = data.pages;
      this._permissions = data.permissions || { read: true, write: false, delete: false, move: false };
      this._selectedPaths = new Set();
      this._lastCheckedIndex = -1;
      this._loadPresence();
      this._detectCbctFolders(data.items);
    } catch (err) {
      this._error = err.message;
      this._items = [];
    } finally {
      this._loading = false;
    }
  }

  /**
   * Sort items by current sort column and direction, directories first.
   * @param {FileItem[]} items
   * @returns {FileItem[]}
   */
  _sortItems(items) {
    const sorted = [...items];
    const dir = this._sortDir === 'asc' ? 1 : -1;

    sorted.sort((a, b) => {
      // Directories first only for name sort; size/modified use pure global sort
      if (this._sortBy === 'name' && a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }

      switch (this._sortBy) {
        case 'size':
          return (a.size - b.size) * dir;
        case 'modified':
          return (new Date(a.modified).getTime() - new Date(b.modified).getTime()) * dir;
        default: // name
          return a.name.localeCompare(b.name) * dir;
      }
    });

    return sorted;
  }

  /**
   * @param {'name'|'size'|'modified'} column
   */
  _toggleSort(column) {
    if (this._sortBy === column) {
      this._sortDir = this._sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this._sortBy = column;
      this._sortDir = 'asc';
    }
    this._page = 1;
    this._loadDirectory();
  }

  /**
   * Toggle expand/collapse for a directory item.
   * On first expansion, loads children from the API.
   * @param {FileItem} item
   */
  async _toggleExpand(item) {
    const path = item.path;

    if (this._expandedDirs.has(path)) {
      const next = new Set(this._expandedDirs);
      next.delete(path);
      this._expandedDirs = next;
    } else {
      this._expandedDirs = new Set([...this._expandedDirs, path]);
      if (!this._treeChildren.has(path)) {
        await this._loadChildren(path);
      }
    }
  }

  /**
   * Expand all top-level directories in the current view.
   * Loads children in parallel for directories not yet cached.
   */
  async _expandAll() {
    const dirs = this._items.filter(item => item.type === 'directory');
    if (dirs.length === 0) return;

    this._expandedDirs = new Set([...this._expandedDirs, ...dirs.map(d => d.path)]);

    const toLoad = dirs.filter(d => !this._treeChildren.has(d.path));
    if (toLoad.length > 0) {
      await Promise.all(toLoad.map(d => this._loadChildren(d.path)));
    }
  }

  /**
   * Collapse all expanded directories.
   */
  _collapseAll() {
    this._expandedDirs = new Set();
  }

  /**
   * Load children for a directory and cache the result.
   * @param {string} virtualPath
   */
  async _loadChildren(virtualPath) {
    this._loadingDirs = new Set([...this._loadingDirs, virtualPath]);

    try {
      const data = await this.#api.listDirectory(virtualPath, { limit: 200 });
      this._treeChildren = new Map([...this._treeChildren, [virtualPath, data.items]]);
      this._treeTotals = new Map([...this._treeTotals, [virtualPath, data.total]]);
    } catch {
      const next = new Set(this._expandedDirs);
      next.delete(virtualPath);
      this._expandedDirs = next;
    } finally {
      const next = new Set(this._loadingDirs);
      next.delete(virtualPath);
      this._loadingDirs = next;
    }
  }

  /**
   * @param {string} newPath
   */
  _navigateTo(newPath) {
    if (this.aliasRoot && !newPath.startsWith(this.aliasRoot)) {
      newPath = this.aliasRoot;
    }
    this.path = newPath;
    this.dispatchEvent(new CustomEvent('navigate', {
      bubbles: true,
      composed: true,
      detail: { path: newPath },
    }));
  }

  /**
   * @param {number} page
   */
  _goToPage(page) {
    this._page = page;
    this._syncPaginationUrl();
    this._loadDirectory();
  }

  /** @param {Event} e */
  _onPageSizeChange(e) {
    this._limit = Number(e.target.value);
    this._page = 1;
    this._syncPaginationUrl();
    this._loadDirectory();
  }

  /** Update the URL query params with current pagination state (pushState for back/forward navigation). */
  _syncPaginationUrl() {
    const newUrl = buildPaginationUrl(window.location.href, this._page, this._limit);
    if (newUrl !== window.location.href) {
      window.history.pushState(null, '', newUrl);
    }
  }

  /** Restore pagination state when the user navigates with browser back/forward. */
  _onPopState() {
    const { page, pageSize } = readPaginationFromUrl(window.location.href);
    if (page !== this._page || pageSize !== this._limit) {
      this._page = page;
      this._limit = pageSize;
      this._loadDirectory();
    }
  }

  /**
   * Reload the current directory (can be called externally).
   */
  reload() {
    this._loadDirectory();
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

  /**
   * @param {string} folderPath
   * @returns {import('lit').TemplateResult|typeof nothing}
   */
  _renderPresenceBadge(folderPath) {
    const users = this._getPresenceForFolder(folderPath);
    if (users.length === 0) return nothing;

    const label = this._presenceLabel(users);
    const title = users.map(u => u.display_name).join(', ');

    return html`<span class="presence-badge" title="${title}"><span class="presence-dot"></span>${label}</span>`;
  }

  // ── Row actions (event delegation) ─────────────────────

  /** @param {Event} e */
  _onTableClick(e) {
    const btn = /** @type {HTMLElement} */ (e.target).closest('[data-action]');
    if (!btn) return;
    e.stopPropagation();
    const { action, path, type } = /** @type {HTMLElement} */ (btn).dataset;
    if (action === 'download') {
      this._downloadFile(path);
    } else if (action === 'copy-link') {
      this._copyItemLink(path, type);
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1500);
    } else if (action === 'shortcut') {
      this._createItemShortcut(path, type);
    } else if (action === 'anonymize') {
      this._openAnonymizeModal(path);
    }
  }

  /**
   * Copy a deep-link URL for an item to the clipboard.
   * Directories link directly; files link to their parent folder.
   * @param {string} itemPath
   * @param {string} itemType
   */
  _copyItemLink(itemPath, itemType) {
    const url = new URL(window.location.href);
    url.searchParams.set('path', itemType === 'directory' ? itemPath : itemPath.substring(0, itemPath.lastIndexOf('/')));
    navigator.clipboard.writeText(url.toString()).catch(() => {});
  }

  /**
   * Download a desktop shortcut file for an item.
   * Detects OS and generates the appropriate format:
   * - Windows: .url (Internet Shortcut)
   * - Linux: .desktop (XDG Desktop Entry)
   * - macOS: .webloc (Property List XML)
   * @param {string} itemPath
   * @param {string} itemType
   */
  _createItemShortcut(itemPath, itemType) {
    const url = new URL(window.location.href);
    url.searchParams.set('path', itemType === 'directory' ? itemPath : itemPath.substring(0, itemPath.lastIndexOf('/')));
    const name = itemPath.split('/').filter(Boolean).pop() || 'Geniova Drive';
    const href = url.toString();

    const ua = navigator.userAgent;
    let content, filename, mime;

    if (ua.includes('Mac')) {
      content = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n\t<key>URL</key>\n\t<string>${href}</string>\n</dict>\n</plist>\n`;
      filename = `${name}.webloc`;
      mime = 'application/x-apple-plist';
    } else if (ua.includes('Linux')) {
      content = `[Desktop Entry]\nEncoding=UTF-8\nType=Link\nName=${name} - Geniova Drive\nURL=${href}\nIcon=text-html\n`;
      filename = `${name}.desktop`;
      mime = 'application/x-desktop';
    } else {
      content = `[InternetShortcut]\nURL=${href}\nIconIndex=0\n`;
      filename = `${name}.url`;
      mime = 'application/internet-shortcut';
    }

    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── File Preview ────────────────────────────────────

  /** Extensions that can be previewed inline in the browser */
  static _previewableExtensions = new Set([
    '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
    '.txt', '.csv', '.json', '.xml', '.html', '.htm',
    '.mp4', '.webm', '.ogg', '.mkv', '.avi', '.mov', '.m4v',
    '.mp3', '.wav', '.flac', '.aac', '.m4a',
    '.stl', '.md', '.dcm', '.epub', '.cbz', '.cbr',
    // Code & scripts
    '.bat', '.cmd', '.sh', '.bash', '.zsh', '.ps1',
    '.js', '.ts', '.jsx', '.tsx', '.css', '.scss', '.less',
    '.py', '.rb', '.php', '.pl', '.lua', '.r',
    '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go', '.rs', '.swift', '.kt', '.scala',
    '.sql', '.graphql',
    // Config
    '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf',
    '.env', '.properties', '.editorconfig',
    '.gitignore', '.dockerignore', '.htaccess',
    // Logs & data
    '.log', '.reg',
  ]);

  /**
   * @param {string} filename
   * @returns {boolean}
   */
  _isPreviewable(filename) {
    const ext = filename.lastIndexOf('.') !== -1
      ? filename.slice(filename.lastIndexOf('.')).toLowerCase()
      : '';
    return GdFileExplorer._previewableExtensions.has(ext);
  }

  /**
   * @param {string} filename
   * @returns {'image'|'pdf'|'text'|'video'|'audio'|'stl'|'markdown'|'unknown'}
   */
  _getPreviewType(filename) {
    // Check for CBCT folder marker
    if (filename.endsWith('(CBCT)')) return 'dicom';
    const ext = filename.lastIndexOf('.') !== -1
      ? filename.slice(filename.lastIndexOf('.')).toLowerCase()
      : '';
    if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(ext)) return 'image';
    if (ext === '.pdf') return 'pdf';
    if (ext === '.stl') return 'stl';
    if (ext === '.md') return 'markdown';
    if (ext === '.dcm') return 'dicom';
    if ([
      '.txt', '.csv', '.json', '.xml', '.html', '.htm',
      '.bat', '.cmd', '.sh', '.bash', '.zsh', '.ps1',
      '.js', '.ts', '.jsx', '.tsx', '.css', '.scss', '.less',
      '.py', '.rb', '.php', '.pl', '.lua', '.r',
      '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go', '.rs', '.swift', '.kt', '.scala',
      '.sql', '.graphql',
      '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf',
      '.env', '.properties', '.editorconfig',
      '.gitignore', '.dockerignore', '.htaccess',
      '.log', '.reg',
    ].includes(ext)) return 'text';
    if (['.mp4', '.webm', '.ogg', '.mkv', '.avi', '.mov', '.m4v'].includes(ext)) return 'video';
    if (['.mp3', '.wav', '.flac', '.aac', '.m4a'].includes(ext)) return 'audio';
    if (ext === '.epub') return 'epub';
    if (['.cbz', '.cbr'].includes(ext)) return 'comic';
    return 'unknown';
  }

  /**
   * Open preview for a file item. Non-previewable files download directly.
   * @param {FileItem} item
   */
  _openPreview(item) {
    if (!this._isPreviewable(item.name)) {
      this._downloadFile(item.path);
      return;
    }
    const type = this._getPreviewType(item.name);
    if (type === 'video') {
      this._closePreview();
      this._inlineVideoFile = item;
    } else {
      this._inlineVideoFile = null;
      this._previewFile = item;
    }
  }

  /**
   * Open dual STL viewer for two selected STL files.
   * @param {FileItem[]} files - Exactly 2 STL file items
   */
  _openDualStl(files) {
    this._stlDualFiles = files;
    this._previewFile = {
      name: `${files[0].name} + ${files[1].name}`,
      path: '__dual-stl__',
      type: 'file',
    };
  }

  _closePreview() {
    this._disposeStlViewer();
    this._stlDualFiles = null;
    if (this._cbctState) {
      this._cbctState.canvas.removeEventListener('wheel', this._cbctState.onWheel);
      this._cbctState = null;
    }
    this._textContent = null;
    if (this._epubBook) { this._epubBook.destroy(); this._epubBook = null; }
    if (this._epubCleanup) { this._epubCleanup(); this._epubCleanup = null; }
    if (this._comicCleanup) { this._comicCleanup(); this._comicCleanup = null; }
    this._comicPages = [];
    this._comicCurrentPage = 0;
    this._previewFile = null;
    this._inlineVideoFile = null;
  }

  async _initEpubViewer(container) {
    const url = container.dataset.url;
    try {
      // epub.js registers as window.ePub — load via script tag
      if (!window.ePub) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      // Fetch the EPUB as ArrayBuffer so epub.js doesn't try to load internal files from the page URL
      const response = await fetch(url);
      if (!response.ok) throw new Error('No se pudo descargar el archivo EPUB');
      const arrayBuffer = await response.arrayBuffer();

      const book = window.ePub(arrayBuffer);

      // Clear loading indicator
      container.innerHTML = '';

      // Create content area and nav
      const content = document.createElement('div');
      content.className = 'epub-content';
      container.appendChild(content);

      const nav = document.createElement('div');
      nav.className = 'epub-nav';
      const prevBtn = document.createElement('button');
      prevBtn.textContent = '← Anterior';
      const pageInfo = document.createElement('span');
      pageInfo.textContent = 'Cargando...';
      const nextBtn = document.createElement('button');
      nextBtn.textContent = 'Siguiente →';
      nav.appendChild(prevBtn);
      nav.appendChild(pageInfo);
      nav.appendChild(nextBtn);
      container.appendChild(nav);

      const rend = book.renderTo(content, {
        width: '100%',
        height: '100%',
        spread: 'none',
      });

      await rend.display();

      rend.on('relocated', (location) => {
        const current = location.start.displayed.page;
        const total = location.start.displayed.total;
        pageInfo.textContent = `${current} / ${total}`;
        prevBtn.disabled = location.atStart;
        nextBtn.disabled = location.atEnd;
      });

      prevBtn.addEventListener('click', () => rend.prev());
      nextBtn.addEventListener('click', () => rend.next());

      // Keyboard navigation
      const keyHandler = (e) => {
        if (e.key === 'ArrowLeft') rend.prev();
        if (e.key === 'ArrowRight') rend.next();
      };
      document.addEventListener('keydown', keyHandler);
      this._epubCleanup = () => document.removeEventListener('keydown', keyHandler);
      this._epubBook = book;
    } catch (err) {
      container.innerHTML = `<div class="epub-loading"><p>Error: ${err.message}</p></div>`;
    }
  }

  async _initComicViewer(container) {
    const filePath = container.dataset.path;
    try {
      // Fetch page list from server
      const res = await fetch(`/api/files/comic-pages?path=${encodeURIComponent(filePath)}`);
      if (!res.ok) throw new Error('No se pudo cargar el comic');
      const data = await res.json();

      if (!data.pages || data.pages.length === 0) {
        throw new Error('El comic no contiene páginas');
      }

      this._comicPages = data.pages;
      this._comicCurrentPage = 0;

      // Build viewer UI
      container.innerHTML = '';

      const pageContainer = document.createElement('div');
      pageContainer.className = 'comic-page-container';
      const img = document.createElement('img');
      img.src = `/api/files/comic-page?path=${encodeURIComponent(filePath)}&page=0`;
      img.alt = data.pages[0].name;
      pageContainer.appendChild(img);
      container.appendChild(pageContainer);

      const nav = document.createElement('div');
      nav.className = 'comic-nav';
      const prevBtn = document.createElement('button');
      prevBtn.textContent = '← Anterior';
      prevBtn.disabled = true;
      const pageInfo = document.createElement('span');
      pageInfo.textContent = `1 / ${data.pages.length}`;
      const nextBtn = document.createElement('button');
      nextBtn.textContent = 'Siguiente →';
      nextBtn.disabled = data.pages.length <= 1;
      nav.appendChild(prevBtn);
      nav.appendChild(pageInfo);
      nav.appendChild(nextBtn);
      container.appendChild(nav);

      const goToPage = (idx) => {
        if (idx < 0 || idx >= data.pages.length) return;
        this._comicCurrentPage = idx;
        img.src = `/api/files/comic-page?path=${encodeURIComponent(filePath)}&page=${idx}`;
        img.alt = data.pages[idx].name;
        pageInfo.textContent = `${idx + 1} / ${data.pages.length}`;
        prevBtn.disabled = idx === 0;
        nextBtn.disabled = idx === data.pages.length - 1;
      };

      prevBtn.addEventListener('click', () => goToPage(this._comicCurrentPage - 1));
      nextBtn.addEventListener('click', () => goToPage(this._comicCurrentPage + 1));

      // Keyboard navigation
      const keyHandler = (e) => {
        if (e.key === 'ArrowLeft') goToPage(this._comicCurrentPage - 1);
        if (e.key === 'ArrowRight') goToPage(this._comicCurrentPage + 1);
      };
      document.addEventListener('keydown', keyHandler);
      this._comicCleanup = () => document.removeEventListener('keydown', keyHandler);
    } catch (err) {
      container.innerHTML = `<div class="comic-loading"><p>Error: ${err.message}</p></div>`;
    }
  }

  /** Dispose Three.js resources */
  _disposeStlViewer() {
    if (this._stlRenderer) {
      this._stlRenderer.dispose();
      this._stlRenderer = null;
    }
    if (this._stlControls) {
      this._stlControls.dispose();
      this._stlControls = null;
    }
    if (this._stlAnimationId) {
      cancelAnimationFrame(this._stlAnimationId);
      this._stlAnimationId = null;
    }
    if (this._stlResizeObserver) {
      this._stlResizeObserver.disconnect();
      this._stlResizeObserver = null;
    }
  }

  /** Initialize Three.js STL viewer (lazy-loaded, supports 1 or 2 models) */
  async _initStlViewer() {
    const container = this.renderRoot.querySelector('.stl-viewer');
    if (!container) return;

    const urls = [container.dataset.url];
    if (container.dataset.url2) urls.push(container.dataset.url2);
    const isDual = urls.length > 1;

    const [THREE, { STLLoader }, { OrbitControls }] = await Promise.all([
      import('three'),
      import('three/examples/jsm/loaders/STLLoader.js'),
      import('three/examples/jsm/controls/OrbitControls.js'),
    ]);

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 400;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;

    scene.add(new THREE.AmbientLight(0x666666));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(1, 1, 1);
    scene.add(dirLight);
    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight2.position.set(-1, -0.5, -1);
    scene.add(dirLight2);

    this._stlRenderer = renderer;
    this._stlControls = controls;

    const loader = new STLLoader();
    const colors = [0x1a73e8, 0xe85d1a];
    const meshes = [];

    for (let i = 0; i < urls.length; i++) {
      const geometry = await new Promise((resolve, reject) => {
        loader.load(urls[i], resolve, undefined, reject);
      });
      const material = new THREE.MeshPhongMaterial({
        color: colors[i],
        specular: 0x444444,
        shininess: 60,
        transparent: isDual,
        opacity: isDual ? 0.8 : 1,
      });
      const mesh = new THREE.Mesh(geometry, material);
      geometry.computeBoundingBox();
      meshes.push(mesh);
      scene.add(mesh);
    }

    if (isDual && meshes.length === 2) {
      // Determine which mesh goes on top (upper jaw) and which on bottom.
      // 1) Name-based: upper/maxil/sup → top, lower/mandib/inf → bottom
      // 2) Geometry: higher original Z centroid → top
      // 3) Fallback: first selected on top
      const names = urls.map(u => decodeURIComponent(u).toLowerCase());
      const upperRe = /upper|maxil|sup/;
      const lowerRe = /lower|mandib|inf/;
      const boxes = meshes.map(m => new THREE.Box3().setFromObject(m));
      const centers = boxes.map(b => { const c = new THREE.Vector3(); b.getCenter(c); return c; });

      let topIdx = 0;
      if (upperRe.test(names[1]) || lowerRe.test(names[0])) {
        topIdx = 1;
      } else if (upperRe.test(names[0]) || lowerRe.test(names[1])) {
        topIdx = 0;
      } else if (centers[1].z > centers[0].z) {
        topIdx = 1;
      }
      const botIdx = 1 - topIdx;

      // Center each mesh individually
      meshes.forEach((m, i) => m.position.sub(centers[i]));

      // Separate on Z axis (bite direction in dental STLs)
      const newBoxes = meshes.map(m => new THREE.Box3().setFromObject(m));
      const halfTop = (newBoxes[topIdx].max.z - newBoxes[topIdx].min.z) / 2;
      const halfBot = (newBoxes[botIdx].max.z - newBoxes[botIdx].min.z) / 2;
      const gap = Math.max(halfTop, halfBot) * 0.05;
      meshes[topIdx].position.z += halfTop + gap;
      meshes[botIdx].position.z -= halfBot + gap;
    } else {
      const combinedBox = new THREE.Box3();
      meshes.forEach(m => combinedBox.expandByObject(m));
      const center = new THREE.Vector3();
      combinedBox.getCenter(center);
      meshes.forEach(m => m.position.sub(center));
    }

    const finalBox = new THREE.Box3();
    meshes.forEach(m => finalBox.expandByObject(m));
    const size = new THREE.Vector3();
    finalBox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    camera.position.set(0, 0, maxDim * 1.8);
    controls.target.set(0, 0, 0);
    controls.update();

    const animate = () => {
      this._stlAnimationId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    if (isDual) {
      const legend = container.querySelector('.stl-legend');
      if (legend) legend.style.display = '';
    }

    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w && h) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    ro.observe(container);
    this._stlResizeObserver = ro;
  }

  /** Initialize Markdown viewer (lazy-loaded) */
  async _initMarkdownViewer() {
    const container = this.renderRoot.querySelector('.markdown-viewer');
    if (!container) return;

    const url = container.dataset.url;
    const [{ marked }] = await Promise.all([import('marked')]);

    const response = await fetch(url);
    const text = await response.text();
    const htmlContent = marked.parse(text);

    container.innerHTML = `<div class="markdown-content">${htmlContent}</div>`;
  }

  /** Initialize DICOM viewer — detects siblings and loads as series if multiple .dcm exist */
  async _initDicomViewer() {
    const container = this.renderRoot.querySelector('.dicom-viewer');
    if (!container) return;

    const file = this._previewFile;

    // If this is a CBCT folder view, delegate to series viewer
    if (file.type === 'cbct-folder') {
      return this._initCbctSeriesViewer(file.path);
    }

    // Check for sibling .dcm files in the same folder
    const parentPath = file.path.substring(0, file.path.lastIndexOf('/'));
    try {
      const data = await this.#api.listDirectory(parentPath, { limit: 2000 });
      const dcmSiblings = data.items
        .filter(f => f.type === 'file' && f.name.toLowerCase().endsWith('.dcm'))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

      if (dcmSiblings.length > 1) {
        // Multiple .dcm files — load as CBCT series starting at the clicked file
        return this._initCbctSeriesViewer(parentPath);
      }
    } catch { /* ignore — fallback to single file view */ }

    // Single .dcm file — original viewer
    const url = container.dataset.url;

    try {
      const dicomModule = await import('dicom-parser');
      const dicomParser = dicomModule.default || dicomModule;

      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const byteArray = new Uint8Array(arrayBuffer);
      const dataSet = dicomParser.parseDicom(byteArray);

      const transferSyntax = (dataSet.string('x00020010') || '').trim();
      const rows = dataSet.uint16('x00280010');
      const cols = dataSet.uint16('x00280011');
      const bitsAllocated = dataSet.uint16('x00280100') || 16;
      const pixelRepresentation = dataSet.uint16('x00280103') || 0;
      const rescaleSlope = parseFloat(dataSet.string('x00281053')) || 1;
      const rescaleIntercept = parseFloat(dataSet.string('x00281052')) || 0;
      const pixelDataElement = dataSet.elements.x7fe00010;

      if (!pixelDataElement || !rows || !cols) {
        container.querySelector('.dicom-loading').innerHTML =
          '<p>No se pueden leer los píxeles DICOM</p>';
        return;
      }

      const pixelCount = rows * cols;
      let pixelData;

      const JPEG_LOSSLESS = new Set(['1.2.840.10008.1.2.4.57', '1.2.840.10008.1.2.4.70']);
      const JPEG_BASELINE = new Set(['1.2.840.10008.1.2.4.50', '1.2.840.10008.1.2.4.51']);

      if (JPEG_LOSSLESS.has(transferSyntax)) {
        // JPEG Lossless — decode with jpeg-lossless-decoder-js
        const jlModule = await import('jpeg-lossless-decoder-js');
        const JpegDecoder = jlModule.lossless?.Decoder || jlModule.default?.lossless?.Decoder || jlModule.Decoder;
        const decoder = new JpegDecoder();
        const frameData = dicomParser.readEncapsulatedImageFrame(dataSet, pixelDataElement, 0);
        const decoded = decoder.decode(frameData.buffer, frameData.byteOffset, frameData.byteLength, bitsAllocated);
        pixelData = pixelRepresentation === 1 ? new Int16Array(decoded) : new Uint16Array(decoded);
      } else if (JPEG_BASELINE.has(transferSyntax)) {
        // JPEG Baseline — browser native decode
        const frameData = dicomParser.readEncapsulatedImageFrame(dataSet, pixelDataElement, 0);
        const blob = new Blob([frameData], { type: 'image/jpeg' });
        const bitmap = await createImageBitmap(blob);
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = cols;
        tmpCanvas.height = rows;
        const tmpCtx = tmpCanvas.getContext('2d');
        tmpCtx.drawImage(bitmap, 0, 0);
        const imgData = tmpCtx.getImageData(0, 0, cols, rows);
        bitmap.close();
        pixelData = new Uint8Array(pixelCount);
        for (let i = 0; i < pixelCount; i++) pixelData[i] = imgData.data[i * 4];
      } else {
        // Uncompressed — read directly
        const pixelOffset = pixelDataElement.dataOffset;
        const availableBytes = arrayBuffer.byteLength - pixelOffset;
        if (bitsAllocated === 16) {
          const neededBytes = pixelCount * 2;
          if (availableBytes < neededBytes) {
            container.querySelector('.dicom-loading').innerHTML =
              '<p>Datos de píxeles incompletos</p>';
            return;
          }
          pixelData = new Array(pixelCount);
          const dv = new DataView(arrayBuffer, pixelOffset, neededBytes);
          for (let i = 0; i < pixelCount; i++) {
            pixelData[i] = pixelRepresentation === 1
              ? dv.getInt16(i * 2, true)
              : dv.getUint16(i * 2, true);
          }
        } else {
          if (availableBytes < pixelCount) {
            container.querySelector('.dicom-loading').innerHTML =
              '<p>Datos de píxeles incompletos</p>';
            return;
          }
          pixelData = new Uint8Array(arrayBuffer, pixelOffset, pixelCount);
        }
      }

      const huData = new Float32Array(pixelCount);
      let minVal = Infinity, maxVal = -Infinity;
      for (let i = 0; i < pixelCount; i++) {
        const hu = pixelData[i] * rescaleSlope + rescaleIntercept;
        huData[i] = hu;
        if (hu < minVal) minVal = hu;
        if (hu > maxVal) maxVal = hu;
      }

      let wc = parseFloat(dataSet.string('x00281050')) || (minVal + maxVal) / 2;
      let ww = parseFloat(dataSet.string('x00281051')) || (maxVal - minVal) || 1;

      const canvas = document.createElement('canvas');
      canvas.width = cols;
      canvas.height = rows;
      canvas.style.maxWidth = '100%';
      canvas.style.maxHeight = '100%';
      canvas.style.objectFit = 'contain';
      canvas.style.cursor = 'crosshair';
      const ctx = canvas.getContext('2d');
      const imageData = ctx.createImageData(cols, rows);

      const renderDicom = () => {
        const lower = wc - ww / 2;
        const upper = wc + ww / 2;
        const range = upper - lower || 1;
        const data = imageData.data;
        for (let i = 0; i < pixelCount; i++) {
          const val = huData[i];
          let gray;
          if (val <= lower) gray = 0;
          else if (val >= upper) gray = 255;
          else gray = ((val - lower) / range) * 255;
          const idx = i * 4;
          data[idx] = gray;
          data[idx + 1] = gray;
          data[idx + 2] = gray;
          data[idx + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);
      };

      renderDicom();

      const loading = container.querySelector('.dicom-loading');
      if (loading) loading.style.display = 'none';

      const canvasContainer = container.querySelector('.dicom-canvas-container');
      if (canvasContainer) {
        canvasContainer.innerHTML = '';
        canvasContainer.appendChild(canvas);
      }

      let dragging = false;
      let startX, startY, startWC, startWW;

      canvas.addEventListener('pointerdown', (e) => {
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startWC = wc;
        startWW = ww;
        canvas.setPointerCapture(e.pointerId);
      });

      canvas.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        wc = startWC + dx;
        ww = Math.max(1, startWW + dy);
        renderDicom();
      });

      canvas.addEventListener('pointerup', () => { dragging = false; });
      canvas.addEventListener('pointercancel', () => { dragging = false; });
    } catch (err) {
      const loading = container.querySelector('.dicom-loading');
      if (loading) {
        loading.innerHTML = `<p>Error al cargar DICOM</p><p style="font-size:11px;opacity:0.7">${err.message}</p>`;
      }
    }
  }

  /**
   * Detect which directories in the current listing contain .dcm files.
   * Checks the first few items of each folder (lightweight).
   * @param {FileItem[]} items
   */
  async _detectCbctFolders(items) {
    const dirs = items.filter(i => i.type === 'directory');
    if (dirs.length === 0) return;

    const checks = dirs.map(async (dir) => {
      try {
        const data = await this.#api.listDirectory(dir.path, { limit: 20 });
        const hasDcm = data.items.some(f => f.type === 'file' && f.name.toLowerCase().endsWith('.dcm'));
        if (hasDcm) return dir.path;
      } catch { /* ignore */ }
      return null;
    });

    const results = await Promise.all(checks);
    const paths = results.filter(Boolean);
    if (paths.length > 0) {
      this._cbctFolderPaths = new Set(paths);
    }
  }

  /**
   * Open CBCT viewer for an entire folder of .dcm files.
   * @param {string} folderPath
   */
  _openCbctFolder(folderPath) {
    // Create a virtual "file" entry for the CBCT viewer
    this._previewFile = {
      name: folderPath.split('/').pop() + ' (CBCT)',
      path: folderPath,
      type: 'cbct-folder',
      size: 0,
      modified: '',
    };
  }

  /**
   * Initialize CBCT series viewer — loads all .dcm from a folder.
   * @param {string} folderPath
   */
  async _initCbctSeriesViewer(folderPath) {
    const container = this.renderRoot.querySelector('.dicom-viewer');
    if (!container) return;

    try {
      const dicomModule = await import('dicom-parser');
      const dicomParser = dicomModule.default || dicomModule;

      // Fetch all files from the folder
      const data = await this.#api.listDirectory(folderPath, { limit: 2000 });
      const dcmFiles = data.items
        .filter(f => f.type === 'file' && f.name.toLowerCase().endsWith('.dcm'))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

      if (dcmFiles.length === 0) {
        const loading = container.querySelector('.dicom-loading');
        if (loading) loading.innerHTML = '<p>No se encontraron archivos DICOM en esta carpeta</p>';
        return;
      }

      const totalSlices = dcmFiles.length;
      const loadingEl = container.querySelector('.dicom-loading');
      const progressEl = container.querySelector('.dicom-slice-progress');

      // Parse all DICOM files (lazy — parse first, then load rest progressively)
      const slices = new Array(totalSlices);
      let loadedCount = 0;

      // Transfer Syntax categories
      const UNCOMPRESSED_TS = new Set([
        '1.2.840.10008.1.2',       // Implicit VR Little Endian
        '1.2.840.10008.1.2.1',     // Explicit VR Little Endian
        '1.2.840.10008.1.2.2',     // Explicit VR Big Endian
      ]);
      const JPEG_LOSSLESS_TS = new Set([
        '1.2.840.10008.1.2.4.57',  // JPEG Lossless, Non-Hierarchical
        '1.2.840.10008.1.2.4.70',  // JPEG Lossless, First-Order Prediction
      ]);
      const JPEG_BASELINE_TS = new Set([
        '1.2.840.10008.1.2.4.50',  // JPEG Baseline
        '1.2.840.10008.1.2.4.51',  // JPEG Extended
      ]);

      // Lazy-load JPEG Lossless decoder only when needed
      let jpegLosslessDecoder = null;

      const parseSlice = async (index) => {
        const url = this.#api.getPreviewUrl(dcmFiles[index].path);
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const byteArray = new Uint8Array(arrayBuffer);
        const dataSet = dicomParser.parseDicom(byteArray);

        const transferSyntax = (dataSet.string('x00020010') || '').trim();
        const rows = dataSet.uint16('x00280010');
        const cols = dataSet.uint16('x00280011');
        const bitsAllocated = dataSet.uint16('x00280100') || 16;
        const bitsStored = dataSet.uint16('x00280101') || bitsAllocated;
        const pixelRepresentation = dataSet.uint16('x00280103') || 0;
        const rescaleSlope = parseFloat(dataSet.string('x00281053')) || 1;
        const rescaleIntercept = parseFloat(dataSet.string('x00281052')) || 0;
        const instanceNumber = dataSet.intString('x00200013') || index;
        const pixelDataElement = dataSet.elements.x7fe00010;

        if (!pixelDataElement || !rows || !cols) return null;

        const pixelCount = rows * cols;
        const huData = new Float32Array(pixelCount);
        let rawPixels;

        if (UNCOMPRESSED_TS.has(transferSyntax) || !transferSyntax) {
          // Uncompressed — read directly
          const pixelOffset = pixelDataElement.dataOffset;
          const availableBytes = arrayBuffer.byteLength - pixelOffset;

          if (bitsAllocated === 16) {
            const neededBytes = pixelCount * 2;
            if (availableBytes < neededBytes) return null;
            rawPixels = new Int16Array(pixelCount);
            const dv = new DataView(arrayBuffer, pixelOffset, neededBytes);
            for (let i = 0; i < pixelCount; i++) {
              rawPixels[i] = pixelRepresentation === 1
                ? dv.getInt16(i * 2, true)
                : dv.getUint16(i * 2, true);
            }
          } else {
            if (availableBytes < pixelCount) return null;
            rawPixels = new Uint8Array(arrayBuffer, pixelOffset, pixelCount);
          }
        } else if (JPEG_LOSSLESS_TS.has(transferSyntax)) {
          // JPEG Lossless — decode with jpeg-lossless-decoder-js
          if (!jpegLosslessDecoder) {
            const jlModule = await import('jpeg-lossless-decoder-js');
            const JpegDecoder = jlModule.lossless?.Decoder || jlModule.default?.lossless?.Decoder || jlModule.Decoder;
            jpegLosslessDecoder = new JpegDecoder();
          }

          // Extract encapsulated frame
          const frameData = dicomParser.readEncapsulatedImageFrame(dataSet, pixelDataElement, 0);

          // Decode JPEG Lossless
          const decoded = jpegLosslessDecoder.decode(frameData.buffer, frameData.byteOffset, frameData.byteLength, bitsAllocated);

          if (bitsAllocated === 16) {
            rawPixels = pixelRepresentation === 1
              ? new Int16Array(decoded)
              : new Uint16Array(decoded);
          } else {
            rawPixels = new Uint8Array(decoded);
          }
        } else if (JPEG_BASELINE_TS.has(transferSyntax)) {
          // JPEG Baseline — decode with browser native
          const frameData = dicomParser.readEncapsulatedImageFrame(dataSet, pixelDataElement, 0);
          const blob = new Blob([frameData], { type: 'image/jpeg' });
          const bitmap = await createImageBitmap(blob);
          const tmpCanvas = document.createElement('canvas');
          tmpCanvas.width = cols;
          tmpCanvas.height = rows;
          const tmpCtx = tmpCanvas.getContext('2d');
          tmpCtx.drawImage(bitmap, 0, 0);
          const imgData = tmpCtx.getImageData(0, 0, cols, rows);
          bitmap.close();
          // Convert RGBA to grayscale
          rawPixels = new Uint8Array(pixelCount);
          for (let i = 0; i < pixelCount; i++) {
            rawPixels[i] = imgData.data[i * 4]; // R channel
          }
        } else {
          return null; // Unsupported transfer syntax
        }

        // Apply rescale to get Hounsfield units
        for (let i = 0; i < pixelCount; i++) {
          huData[i] = rawPixels[i] * rescaleSlope + rescaleIntercept;
        }

        // Window defaults
        const wc = parseFloat(dataSet.string('x00281050')) || 0;
        const ww = parseFloat(dataSet.string('x00281051')) || 0;

        return { rows, cols, huData, instanceNumber, wc, ww };
      };

      // Load first valid slice to show something
      let firstValidIdx = -1;
      for (let i = 0; i < totalSlices; i++) {
        slices[i] = await parseSlice(i);
        loadedCount++;
        if (slices[i] && firstValidIdx === -1) {
          firstValidIdx = i;
          break;
        }
      }
      if (firstValidIdx === -1) {
        if (loadingEl) loadingEl.innerHTML = '<p>Los archivos DICOM usan compresión no soportada (JPEG/JPEG2000)</p>';
        return;
      }

      const firstSlice = slices[firstValidIdx];
      const { rows, cols } = firstSlice;
      const pixelCount = rows * cols;

      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.width = cols;
      canvas.height = rows;
      canvas.style.maxWidth = '100%';
      canvas.style.maxHeight = '100%';
      canvas.style.objectFit = 'contain';
      canvas.style.cursor = 'crosshair';
      const ctx = canvas.getContext('2d');
      const imageData = ctx.createImageData(cols, rows);

      // Auto window from first valid slice
      let minVal = Infinity, maxVal = -Infinity;
      for (let i = 0; i < pixelCount; i++) {
        if (firstSlice.huData[i] < minVal) minVal = firstSlice.huData[i];
        if (firstSlice.huData[i] > maxVal) maxVal = firstSlice.huData[i];
      }
      let wc = firstSlice.wc || (minVal + maxVal) / 2;
      let ww = firstSlice.ww || (maxVal - minVal) || 1;
      let currentSlice = firstValidIdx;

      const renderSlice = (index) => {
        const slice = slices[index];
        if (!slice) return;
        const lower = wc - ww / 2;
        const upper = wc + ww / 2;
        const range = upper - lower || 1;
        const data = imageData.data;
        for (let i = 0; i < slice.huData.length; i++) {
          const val = slice.huData[i];
          let gray;
          if (val <= lower) gray = 0;
          else if (val >= upper) gray = 255;
          else gray = ((val - lower) / range) * 255;
          const idx = i * 4;
          data[idx] = gray;
          data[idx + 1] = gray;
          data[idx + 2] = gray;
          data[idx + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);
      };

      // Show first valid slice
      renderSlice(firstValidIdx);

      // Hide loading, show canvas
      if (loadingEl) loadingEl.style.display = 'none';
      const canvasContainer = container.querySelector('.dicom-canvas-container');
      if (canvasContainer) {
        canvasContainer.innerHTML = '';
        canvasContainer.appendChild(canvas);
      }

      // Update slice indicator
      const sliceIndicator = container.querySelector('.dicom-slice-indicator');
      const updateIndicator = () => {
        if (sliceIndicator) {
          sliceIndicator.textContent = `Corte ${currentSlice + 1} / ${totalSlices}`;
        }
      };
      updateIndicator();

      // Update progress indicator
      const updateProgress = () => {
        if (progressEl) {
          if (loadedCount < totalSlices) {
            progressEl.textContent = `Cargando: ${loadedCount}/${totalSlices}`;
            progressEl.style.display = '';
          } else {
            progressEl.style.display = 'none';
          }
        }
      };
      updateProgress();

      // Mouse wheel for slice navigation (skip null/compressed slices)
      const onWheel = (e) => {
        e.preventDefault();
        const dir = e.deltaY > 0 ? 1 : -1;
        let next = currentSlice + dir;
        while (next >= 0 && next < totalSlices && !slices[next]) next += dir;
        if (next >= 0 && next < totalSlices && slices[next]) {
          currentSlice = next;
          renderSlice(currentSlice);
          updateIndicator();
        }
      };
      canvas.addEventListener('wheel', onWheel, { passive: false });

      // Mouse windowing: horizontal = center, vertical = width
      let dragging = false;
      let startX, startY, startWC, startWW;

      canvas.addEventListener('pointerdown', (e) => {
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startWC = wc;
        startWW = ww;
        canvas.setPointerCapture(e.pointerId);
      });

      canvas.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        wc = startWC + dx;
        ww = Math.max(1, startWW + dy);
        renderSlice(currentSlice);
      });

      canvas.addEventListener('pointerup', () => { dragging = false; });
      canvas.addEventListener('pointercancel', () => { dragging = false; });

      // Store state for cleanup
      this._cbctState = { canvas, onWheel };

      // Load remaining slices progressively in background (skip already loaded)
      const BATCH_SIZE = 5;
      const remaining = [];
      for (let i = 0; i < totalSlices; i++) {
        if (slices[i] === undefined) remaining.push(i);
      }
      for (let b = 0; b < remaining.length; b += BATCH_SIZE) {
        const batch = remaining.slice(b, b + BATCH_SIZE);
        await Promise.all(batch.map(idx =>
          parseSlice(idx).then(s => { slices[idx] = s; loadedCount++; })
        ));
        updateProgress();
      }
    } catch (err) {
      const loading = container.querySelector('.dicom-loading');
      if (loading) {
        loading.innerHTML = `<p>Error al cargar CBCT</p><p style="font-size:11px;opacity:0.7">${err.message}</p>`;
      }
    }
  }

  /**
   * @param {string} filePath
   */
  _downloadFile(filePath) {
    const a = document.createElement('a');
    a.href = this.#api.getDownloadUrl(filePath);
    a.download = '';
    a.click();
  }

  /** Fetch text file content for preview */
  async _loadTextContent(file) {
    this._textContent = null;
    this._textLoading = true;
    try {
      const url = this.#api.getPreviewUrl(file.path);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      // Limit display to first 500KB to avoid browser hang
      this._textContent = text.length > 512000 ? text.slice(0, 512000) + '\n\n… (archivo truncado, demasiado grande para previsualizar)' : text;
    } catch {
      this._textContent = 'No se pudo cargar el contenido del archivo.';
    } finally {
      this._textLoading = false;
    }
  }

  /** Render preview content (shared between panel and overlay) */
  _renderPreviewContent(file) {
    const previewType = this._getPreviewType(file.name);
    const previewUrl = this.#api.getPreviewUrl(file.path);

    if (previewType === 'image') {
      return html`<img src="${previewUrl}" alt="${file.name}" />`;
    }
    if (previewType === 'pdf') {
      return html`<iframe src="${previewUrl}" title="${file.name}"></iframe>`;
    }
    if (previewType === 'text') {
      if (this._textLoading) {
        return html`<div class="text-viewer-loading"><div class="spinner"></div> Cargando...</div>`;
      }
      if (this._textContent !== null) {
        return html`<pre class="text-viewer">${this._textContent}</pre>`;
      }
      return html`<div class="text-viewer-loading"><div class="spinner"></div> Cargando...</div>`;
    }
    if (previewType === 'video') {
      return html`<video controls src="${previewUrl}" style="max-width:100%;max-height:100%"></video>`;
    }
    if (previewType === 'audio') {
      return html`<audio controls src="${previewUrl}"></audio>`;
    }
    if (this._stlDualFiles) {
      const url1 = this.#api.getPreviewUrl(this._stlDualFiles[0].path);
      const url2 = this.#api.getPreviewUrl(this._stlDualFiles[1].path);
      return html`<div class="stl-viewer" data-url="${url1}" data-url2="${url2}" style="position:relative">
        <div class="stl-loading"><div class="spinner"></div><p>Cargando modelos 3D...</p></div>
        <div class="stl-legend" style="display:none">
          <div class="stl-legend-item"><span class="stl-legend-color" style="background:#1a73e8"></span>${this._stlDualFiles[0].name}</div>
          <div class="stl-legend-item"><span class="stl-legend-color" style="background:#e85d1a"></span>${this._stlDualFiles[1].name}</div>
        </div>
      </div>`;
    }
    if (previewType === 'stl') {
      return html`<div class="stl-viewer" data-url="${previewUrl}">
        <div class="stl-loading"><div class="spinner"></div><p>Cargando modelo 3D...</p></div>
      </div>`;
    }
    if (previewType === 'markdown') {
      return html`<div class="markdown-viewer" data-url="${previewUrl}">
        <div class="stl-loading"><div class="spinner"></div><p>Cargando documento...</p></div>
      </div>`;
    }
    if (previewType === 'dicom' || file.type === 'cbct-folder') {
      const viewerId = `dcm-${Date.now()}`;
      return html`<div class="dicom-viewer" data-url="${previewUrl}" data-viewer-id="${viewerId}">
        <div class="dicom-slice-indicator"></div>
        <div class="dicom-slice-progress"></div>
        <div id="${viewerId}" class="dicom-canvas-container"></div>
        <div class="dicom-loading"><div class="spinner"></div><p>${file.type === 'cbct-folder' ? 'Cargando serie CBCT...' : 'Cargando imagen DICOM...'}</p></div>
        <div class="dicom-hint">Arrastrar: brillo/contraste · Scroll: cambiar corte</div>
      </div>`;
    }
    if (previewType === 'epub') {
      return html`<div class="epub-viewer" data-url="${previewUrl}">
        <div class="epub-loading"><div class="spinner"></div><p>Cargando libro...</p></div>
      </div>`;
    }
    if (previewType === 'comic') {
      return html`<div class="comic-viewer" data-path="${file.path}">
        <div class="comic-loading"><div class="spinner"></div><p>Cargando comic...</p></div>
      </div>`;
    }
    return html`
      <div class="preview-unsupported">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>
        <p>No se puede previsualizar este archivo</p>
      </div>
    `;
  }

  /** Inline video player below the file list */
  _renderInlineVideo() {
    const file = this._inlineVideoFile;
    const videoUrl = this.#api.getPreviewUrl(file.path);
    return html`
      <div class="inline-video">
        <div class="inline-video-header">
          <span title="${file.name}">${file.name}</span>
          <div style="display:flex;gap:4px">
            <button @click=${() => this._downloadFile(file.path)} title="Descargar">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
            </button>
            <button @click=${() => { this._inlineVideoFile = null; }} title="Cerrar">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          </div>
        </div>
        <video controls autoplay src="${videoUrl}" style="max-width:100%;max-height:70vh"></video>
      </div>
    `;
  }

  /** Side panel preview (desktop >= 768px) */
  _renderPreviewPanel() {
    const file = this._previewFile;
    const isDual = !!this._stlDualFiles;

    return html`
      <div class="preview-panel" role="dialog" aria-label="Vista previa de archivo">
        <div class="preview-header">
          <span class="preview-title">${file.name}</span>
          ${!isDual ? html`
            <button @click=${() => this._downloadFile(file.path)} title="Descargar">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
            </button>
          ` : nothing}
          <button @click=${() => this._closePreview()} title="Cerrar">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
        <div class="preview-body">
          ${this._renderPreviewContent(file)}
        </div>
      </div>
    `;
  }

  /** Overlay modal preview (mobile < 768px) */
  _renderPreviewOverlay() {
    const file = this._previewFile;
    const isDual = !!this._stlDualFiles;

    return html`
      <div class="preview-overlay" role="dialog" aria-modal="true" aria-label="Vista previa de archivo" @click=${(e) => { if (e.target === e.currentTarget) this._closePreview(); }}>
        <div class="preview-header">
          <span class="preview-title">${file.name}</span>
          ${!isDual ? html`
            <button @click=${() => this._downloadFile(file.path)} title="Descargar">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
              Descargar
            </button>
          ` : nothing}
          <button @click=${() => this._closePreview()} title="Cerrar">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            Cerrar
          </button>
        </div>
        <div class="preview-body">
          ${this._renderPreviewContent(file)}
        </div>
      </div>
    `;
  }

  // ── Selection & File Management ─────────────────────

  /**
   * @param {string} itemPath
   * @param {MouseEvent} [e]
   */
  _toggleSelect(itemPath, e) {
    const currentIndex = this._items.findIndex(i => i.path === itemPath);
    const next = new Set(this._selectedPaths);

    if (e?.shiftKey && this._lastCheckedIndex >= 0 && currentIndex !== this._lastCheckedIndex) {
      const start = Math.min(this._lastCheckedIndex, currentIndex);
      const end = Math.max(this._lastCheckedIndex, currentIndex);
      for (let i = start; i <= end; i++) {
        next.add(this._items[i].path);
      }
    } else {
      if (next.has(itemPath)) next.delete(itemPath);
      else next.add(itemPath);
    }

    this._lastCheckedIndex = currentIndex;
    this._selectedPaths = next;
  }

  /** @param {boolean} checked */
  _toggleSelectAll(checked) {
    if (checked) {
      this._selectedPaths = new Set(this._items.map(i => i.path));
    } else {
      this._selectedPaths = new Set();
    }
  }

  /** Return all visible items: top-level + expanded tree children */
  _getAllItems() {
    const all = [...this._items];
    for (const children of this._treeChildren.values()) {
      all.push(...children);
    }
    return all;
  }

  _renderActionToolbar() {
    const count = this._selectedPaths.size;
    const hasSelection = count > 0;
    const selectedStls = count === 2
      ? this._getAllItems().filter(i => this._selectedPaths.has(i.path) && i.name.toLowerCase().endsWith('.stl'))
      : [];
    const canDualStl = selectedStls.length === 2;
    return html`
      <div class="action-toolbar ${hasSelection ? 'has-selection' : ''}">
        <span class="selected-count">
          ${hasSelection ? `${count} seleccionado${count > 1 ? 's' : ''}` : 'Ningún elemento seleccionado'}
        </span>
        ${canDualStl ? html`
          <button @click=${() => this._openDualStl(selectedStls)}>
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
            Ver STL
          </button>
        ` : nothing}
        ${this._permissions.move ? html`
          <button ?disabled=${!hasSelection} @click=${() => this._openMoveDialog()}>
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 9V4.5L18.5 10H14c-.55 0-1-.45-1-1zm-3 4l3 3 3-3h-2v-3h-2v3H10z"/></svg>
            Mover
          </button>
        ` : nothing}
        ${this._permissions.delete ? html`
          <button class="danger" ?disabled=${!hasSelection} @click=${() => { this._showDeleteDialog = true; }}>
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            Eliminar
          </button>
        ` : nothing}
        ${hasSelection ? html`
          <button class="deselect-btn" @click=${() => { this._selectedPaths = new Set(); }}>
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        ` : nothing}
      </div>
    `;
  }

  // ── Create folder dialog ──────────────────────────

  _renderMkdirDialog() {
    return html`
      <div class="modal-backdrop" @click=${(e) => { if (e.target === e.currentTarget) this._showMkdirDialog = false; }}
        @keydown=${(e) => { if (e.key === 'Escape') this._showMkdirDialog = false; }}>
        <div class="modal-dialog" role="dialog" aria-modal="true" aria-label="Nueva carpeta">
          <h3>Nueva carpeta</h3>
          <div class="modal-body">
            <input type="text" placeholder="Nombre de la carpeta"
              .value=${this._mkdirName}
              @input=${(e) => { this._mkdirName = e.target.value; }}
              @keydown=${(e) => { if (e.key === 'Enter' && this._mkdirName.trim()) this._doMkdir(); }}
              autofocus />
          </div>
          <div class="modal-footer">
            <button @click=${() => { this._showMkdirDialog = false; }}>Cancelar</button>
            <button class="primary" ?disabled=${!this._mkdirName.trim() || this._operationInProgress}
              @click=${() => this._doMkdir()}>Crear</button>
          </div>
        </div>
      </div>
    `;
  }

  async _doMkdir() {
    const name = this._mkdirName.trim();
    if (!name) return;
    this._operationInProgress = true;
    try {
      await this.#api.createDirectory(`${this.path}/${name}`);
      this._showMkdirDialog = false;
      this._loadDirectory();
    } catch (err) {
      this._mkdirName = '';
      this.renderRoot.querySelector('.modal-dialog input')?.focus();
      // Show inline error — re-use the input placeholder
      const input = this.renderRoot.querySelector('.modal-dialog input');
      if (input) { input.placeholder = err.message; input.classList.add('error'); }
    } finally {
      this._operationInProgress = false;
    }
  }

  // ── Delete dialog ──────────────────────────────────

  _renderDeleteDialog() {
    const count = this._selectedPaths.size;
    return html`
      <div class="modal-backdrop" @click=${(e) => { if (e.target === e.currentTarget) this._showDeleteDialog = false; }}
        @keydown=${(e) => { if (e.key === 'Escape') this._showDeleteDialog = false; }}>
        <div class="modal-dialog" role="dialog" aria-modal="true" aria-label="Confirmar eliminación">
          <h3>Eliminar ${count > 1 ? `${count} elementos` : 'elemento'}</h3>
          <div class="modal-body">
            ${this._operationInProgress
              ? html`<div class="op-message"><div class="spinner"></div> Eliminando...</div>`
              : html`
                <p class="op-message">
                  ${count === 1
                    ? html`¿Seguro que quieres eliminar <strong>${[...this._selectedPaths][0].split('/').pop()}</strong>?`
                    : html`¿Seguro que quieres eliminar <strong>${count} elementos</strong>?`
                  }
                  Los elementos se moverán a la papelera.
                </p>
              `}
          </div>
          <div class="modal-footer">
            <button @click=${() => { this._showDeleteDialog = false; }} ?disabled=${this._operationInProgress}>Cancelar</button>
            <button class="danger" @click=${() => this._doDelete()} ?disabled=${this._operationInProgress}>Eliminar</button>
          </div>
        </div>
      </div>
    `;
  }

  async _doDelete() {
    const paths = [...this._selectedPaths];
    this._operationInProgress = true;
    const errors = [];

    for (const p of paths) {
      try {
        await this.#api.deleteItem(p);
      } catch (err) {
        errors.push({ path: p, error: err.message });
      }
    }

    this._operationInProgress = false;
    this._showDeleteDialog = false;
    this._selectedPaths = new Set();
    this._loadDirectory();

    if (errors.length > 0) {
      this._error = `Error al eliminar ${errors.length} elemento(s): ${errors.map(e => e.path.split('/').pop()).join(', ')}`;
    }
  }

  // ── Move dialog ──────────────────────────────────

  _openMoveDialog() {
    this._showMoveDialog = true;
    this._moveBrowsePath = this.path;
    this._loadMoveBrowse(this.path);
  }

  async _loadMoveBrowse(browsePath) {
    this._moveBrowseLoading = true;
    this._moveBrowsePath = browsePath;
    try {
      const data = await this.#api.listDirectory(browsePath, { limit: 200 });
      this._moveBrowseItems = data.items.filter(i => i.type === 'directory');
    } catch {
      this._moveBrowseItems = [];
    } finally {
      this._moveBrowseLoading = false;
    }
  }

  _renderMoveDialog() {
    const count = this._selectedPaths.size;
    const pathParts = this._moveBrowsePath.split('/').filter(Boolean);

    return html`
      <div class="modal-backdrop" @click=${(e) => { if (e.target === e.currentTarget) this._showMoveDialog = false; }}
        @keydown=${(e) => { if (e.key === 'Escape') this._showMoveDialog = false; }}>
        <div class="modal-dialog" role="dialog" aria-modal="true" aria-label="Mover elementos" style="min-width:420px">
          <h3>Mover ${count > 1 ? `${count} elementos` : 'elemento'}</h3>
          <div class="modal-body">
            ${this._operationInProgress
              ? html`<div class="op-message"><div class="spinner"></div> Moviendo...</div>`
              : html`
                <div class="move-browser-path">
                  ${pathParts.map((seg, i) => html`
                    ${i > 0 ? html`<span>/</span>` : nothing}
                    <button @click=${() => this._loadMoveBrowse('/' + pathParts.slice(0, i + 1).join('/'))}>${seg}</button>
                  `)}
                </div>
                <div class="move-browser">
                  ${this._moveBrowseLoading ? html`<div style="padding:16px;text-align:center"><div class="mini-spinner"></div></div>` : nothing}
                  ${!this._moveBrowseLoading && this._moveBrowseItems.length === 0 ? html`<div style="padding:12px;text-align:center;color:var(--color-text-secondary, #5f6368);font-size:12px">Sin carpetas</div>` : nothing}
                  ${this._moveBrowseItems.map(dir => html`
                    <div class="move-browser-item" @click=${() => this._loadMoveBrowse(dir.path)}>
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
                      ${dir.name}
                    </div>
                  `)}
                </div>
                <div class="move-dest-label">Destino: <strong>${this._moveBrowsePath}</strong></div>
              `}
          </div>
          <div class="modal-footer">
            <button @click=${() => { this._showMoveDialog = false; }} ?disabled=${this._operationInProgress}>Cancelar</button>
            <button class="primary" @click=${() => this._doMove()}
              ?disabled=${this._operationInProgress || this._moveBrowsePath === this.path}>
              Mover aquí
            </button>
          </div>
        </div>
      </div>
    `;
  }

  async _doMove() {
    const paths = [...this._selectedPaths];
    const dest = this._moveBrowsePath;
    this._operationInProgress = true;
    const errors = [];

    for (const p of paths) {
      try {
        await this.#api.moveItem(p, dest);
      } catch (err) {
        errors.push({ path: p, error: err.message });
      }
    }

    this._operationInProgress = false;
    this._showMoveDialog = false;
    this._selectedPaths = new Set();
    this._loadDirectory();

    if (errors.length > 0) {
      this._error = `Error al mover ${errors.length} elemento(s): ${errors.map(e => `${e.path.split('/').pop()} (${e.error})`).join(', ')}`;
    }
  }

  // ── Anonymize dialog ──────────────────────────────────

  async _openAnonymizeModal(filePath) {
    this._anonymizePath = filePath;
    this._anonymizeData = null;
    this._anonymizeConfig = [];
    this._anonymizeError = null;
    this._anonymizeResult = null;
    this._anonymizeSelectedTable = null;
    this._showAnonymizeModal = true;
    this._anonymizeLoading = true;

    try {
      const data = await this.#api.parseData(filePath, 5);
      this._anonymizeData = data;

      if (data.format === 'sql' && data.tables?.length > 0) {
        this._anonymizeSelectedTable = data.tables[0].name;
        this._anonymizeConfig = data.tables[0].columns.map(col => ({
          name: col.name, strategy: 'preserve',
        }));
      } else if (data.format === 'csv' && data.columns) {
        this._anonymizeConfig = data.columns.map(col => ({
          name: col.name, strategy: 'preserve',
        }));
      }
    } catch (err) {
      this._anonymizeError = err.message;
    } finally {
      this._anonymizeLoading = false;
    }
  }

  _onAnonymizeTableChange(e) {
    const tableName = e.target.value;
    this._anonymizeSelectedTable = tableName;
    const table = this._anonymizeData.tables.find(t => t.name === tableName);
    if (table) {
      this._anonymizeConfig = table.columns.map(col => ({
        name: col.name, strategy: 'preserve',
      }));
    }
  }

  _onAnonymizeStrategyChange(colName, strategy) {
    this._anonymizeConfig = this._anonymizeConfig.map(c =>
      c.name === colName ? { ...c, strategy, fakerType: strategy === 'fake' ? 'name' : undefined } : c
    );
  }

  _onAnonymizeFakerTypeChange(colName, fakerType) {
    this._anonymizeConfig = this._anonymizeConfig.map(c =>
      c.name === colName ? { ...c, fakerType } : c
    );
  }

  async _doAnonymize() {
    this._anonymizeLoading = true;
    this._anonymizeError = null;
    this._anonymizeResult = null;

    try {
      const result = await this.#api.anonymizeData(
        this._anonymizePath,
        this._anonymizeConfig,
        this._anonymizeData?.format === 'sql' ? this._anonymizeSelectedTable : undefined,
      );
      this._anonymizeResult = result;
      this._loadDirectory();
    } catch (err) {
      this._anonymizeError = err.message;
    } finally {
      this._anonymizeLoading = false;
    }
  }

  _closeAnonymizeModal() {
    this._showAnonymizeModal = false;
    this._anonymizePath = null;
    this._anonymizeData = null;
    this._anonymizeConfig = [];
    this._anonymizeError = null;
    this._anonymizeResult = null;
  }

  _renderAnonymizeModal() {
    const fileName = this._anonymizePath?.split('/').pop() || '';
    const data = this._anonymizeData;
    const isSql = data?.format === 'sql';
    const columns = isSql
      ? (data.tables?.find(t => t.name === this._anonymizeSelectedTable)?.columns || [])
      : (data?.columns || []);
    const sampleRows = isSql
      ? (data.tables?.find(t => t.name === this._anonymizeSelectedTable)?.sampleRows || [])
      : (data?.sampleRows || []);
    const hasNonPreserve = this._anonymizeConfig.some(c => c.strategy !== 'preserve');

    return html`
      <div class="modal-backdrop" @click=${(e) => { if (e.target === e.currentTarget) this._closeAnonymizeModal(); }}
        @keydown=${(e) => { if (e.key === 'Escape') this._closeAnonymizeModal(); }}>
        <div class="modal-dialog anon-modal" role="dialog" aria-modal="true" aria-label="Anonimizar datos">
          <div class="anon-header">
            <h3>Anonimizar: ${fileName}</h3>
            <a class="anon-help-link" href="/docs/data-anonymizer" target="_blank" rel="noopener">
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden="true"><path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"/></svg>
              Ayuda
            </a>
          </div>
          <div class="modal-body anon-body">
            ${this._anonymizeLoading && !this._anonymizeData
              ? html`<div class="op-message"><div class="spinner"></div> Analizando archivo...</div>`
              : nothing}
            ${this._anonymizeError
              ? html`<div class="anon-error" role="alert">${this._anonymizeError}</div>`
              : nothing}
            ${this._anonymizeResult
              ? html`
                <div class="anon-result">
                  <p class="anon-result-success">
                    <strong>Archivo anonimizado generado correctamente.</strong>
                  </p>
                  <div class="anon-result-path">${this._anonymizeResult.outputPath}</div>
                  <div class="anon-stats">
                    ${this._anonymizeResult.stats?.rowsProcessed ? html`Filas procesadas: <strong>${this._anonymizeResult.stats.rowsProcessed}</strong>` : nothing}
                    ${this._anonymizeResult.stats?.columnsAnonymized ? html` · Columnas anonimizadas: <strong>${this._anonymizeResult.stats.columnsAnonymized}</strong>` : nothing}
                    ${this._anonymizeResult.stats?.tablesProcessed ? html` · Tablas: <strong>${this._anonymizeResult.stats.tablesProcessed}</strong>` : nothing}
                  </div>
                </div>
              ` : nothing}
            ${data && !this._anonymizeResult ? html`
              ${isSql && data.tables?.length > 1 ? html`
                <div class="anon-table-selector">
                  <label>Tabla:
                    <select @change=${(e) => this._onAnonymizeTableChange(e)}>
                      ${data.tables.map(t => html`
                        <option value=${t.name} ?selected=${t.name === this._anonymizeSelectedTable}>
                          ${t.name} (${t.totalRowsEstimate} filas)
                        </option>
                      `)}
                    </select>
                  </label>
                </div>
              ` : nothing}
              <table class="anon-grid">
                <thead>
                  <tr>
                    <th>Columna</th>
                    <th>Tipo</th>
                    <th>Ejemplo</th>
                    <th>Estrategia</th>
                  </tr>
                </thead>
                <tbody>
                  ${columns.map((col, ci) => {
                    const cfg = this._anonymizeConfig.find(c => c.name === col.name);
                    const sampleVal = sampleRows[0] ? (Array.isArray(sampleRows[0]) ? sampleRows[0][ci] : sampleRows[0][col.name]) : '';
                    return html`
                      <tr>
                        <td><strong>${col.name}</strong></td>
                        <td><span class="type-badge">${col.type || col.inferredType || 'text'}</span></td>
                        <td class="sample-cell" title=${String(sampleVal ?? '')}>${String(sampleVal ?? '')}</td>
                        <td>
                          <select .value=${cfg?.strategy || 'preserve'} @change=${(e) => this._onAnonymizeStrategyChange(col.name, e.target.value)} aria-label=${`Estrategia para ${col.name}`}>
                            <option value="preserve">Preservar</option>
                            <option value="fake">Faker (generar)</option>
                            <option value="mask">Enmascarar</option>
                            <option value="hash">Hash</option>
                            <option value="shuffle">Mezclar</option>
                          </select>
                          ${cfg?.strategy === 'fake' ? html`
                            <select .value=${cfg.fakerType || 'name'} @change=${(e) => this._onAnonymizeFakerTypeChange(col.name, e.target.value)} aria-label=${`Tipo faker para ${col.name}`} style="margin-left:4px">
                              <option value="name">Nombre</option>
                              <option value="email">Email</option>
                              <option value="phone">Teléfono</option>
                              <option value="address">Dirección</option>
                              <option value="company">Empresa</option>
                              <option value="nif">NIF</option>
                              <option value="date">Fecha</option>
                              <option value="number">Número</option>
                              <option value="text">Texto</option>
                            </select>
                          ` : nothing}
                        </td>
                      </tr>
                    `;
                  })}
                </tbody>
              </table>
            ` : nothing}
          </div>
          <div class="modal-footer">
            <button @click=${() => this._closeAnonymizeModal()}>
              ${this._anonymizeResult ? 'Cerrar' : 'Cancelar'}
            </button>
            ${!this._anonymizeResult ? html`
              <button class="primary" @click=${() => this._doAnonymize()}
                ?disabled=${this._anonymizeLoading || !hasNonPreserve}>
                ${this._anonymizeLoading ? 'Procesando...' : 'Generar archivo anonimizado'}
              </button>
            ` : nothing}
          </div>
        </div>
      </div>
    `;
  }

  // ── Local Search ──────────────────────────────────────

  _renderLocalSearch() {
    return html`
      <div class="local-search-wrapper">
        <select
          class="local-search-mode"
          .value=${this._localSearchMode}
          @change=${this._onLocalSearchModeChange}
          aria-label="Modo de búsqueda"
        >
          <option value="contains">Contiene</option>
          <option value="starts">Empieza por</option>
          <option value="ends">Termina por</option>
        </select>
        <div class="local-search-input-wrapper">
          <svg class="local-search-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
          </svg>
          <input
            class="local-search-input"
            type="text"
            placeholder="Buscar en esta carpeta..."
            .value=${this._localSearchQuery}
            @input=${this._onLocalSearchInput}
            @keydown=${this._onLocalSearchKeydown}
            @focus=${this._onLocalSearchFocus}
            @blur=${this._onLocalSearchBlur}
            aria-label="Buscar en esta carpeta"
          />
          ${this._showLocalResults && (this._localSearchResults.length > 0 || (this._localSearchQuery.length >= 2 && !this._localSearching)) ? html`
            <div class="local-search-results">
              ${this._localSearchResults.length > 0
                ? this._localSearchResults.map(item => html`
                  <div class="local-result-item" @mousedown=${() => this._onLocalResultClick(item)}>
                    ${item.type === 'directory'
                      ? html`<svg class="local-result-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`
                      : html`<svg class="local-result-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>`
                    }
                    <span class="local-result-name">${item.name}</span>
                    <span class="local-result-path">${this._getLocalRelativePath(item.path)}</span>
                  </div>
                `)
                : html`<div class="local-search-empty">No se encontraron resultados</div>`
              }
            </div>
          ` : nothing}
        </div>
      </div>
    `;
  }

  /** @param {Event} e */
  _onLocalSearchModeChange(e) {
    this._localSearchMode = /** @type {HTMLSelectElement} */ (e.target).value;
    if (this._localSearchQuery.length >= 2) {
      this._executeLocalSearch();
    }
  }

  /** @param {InputEvent} e */
  _onLocalSearchInput(e) {
    this._localSearchQuery = /** @type {HTMLInputElement} */ (e.target).value;

    if (this._localDebounceTimer) clearTimeout(this._localDebounceTimer);

    if (this._localSearchQuery.length >= 2) {
      this._localDebounceTimer = setTimeout(() => this._executeLocalSearch(), 300);
    } else {
      this._localSearchResults = [];
      this._showLocalResults = false;
    }
  }

  /** @param {KeyboardEvent} e */
  _onLocalSearchKeydown(e) {
    if (e.key === 'Enter' && this._localSearchQuery.length >= 2) {
      if (this._localDebounceTimer) clearTimeout(this._localDebounceTimer);
      this._executeLocalSearch();
    }
    if (e.key === 'Escape') {
      this._showLocalResults = false;
    }
  }

  _onLocalSearchFocus() {
    if (this._localSearchResults.length > 0) {
      this._showLocalResults = true;
    }
  }

  _onLocalSearchBlur() {
    setTimeout(() => { this._showLocalResults = false; }, 200);
  }

  async _executeLocalSearch() {
    this._localSearching = true;
    this._showLocalResults = true;

    try {
      const data = await this.#api.searchFiles(this.path, this._localSearchQuery, { mode: this._localSearchMode });
      this._localSearchResults = data.results;
    } catch {
      this._localSearchResults = [];
    } finally {
      this._localSearching = false;
    }
  }

  /**
   * Navigate to a local search result.
   * @param {{name: string, type: string, path: string}} item
   */
  _onLocalResultClick(item) {
    if (item.type === 'directory') {
      this._navigateTo(item.path);
    } else {
      // Navigate to the parent directory
      const parent = item.path.substring(0, item.path.lastIndexOf('/'));
      this._navigateTo(parent);
    }
    this._showLocalResults = false;
    this._localSearchQuery = '';
    this._localSearchResults = [];
  }

  /**
   * Get a relative path from the current folder for display.
   * @param {string} fullPath
   * @returns {string}
   */
  _getLocalRelativePath(fullPath) {
    const parentPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
    if (parentPath === this.path) return '';
    const relative = parentPath.slice(this.path.length).replace(/^\//, '');
    return relative ? `./${relative}` : '';
  }

  // ── Presence ────────────────────────────────────────

  _startHeartbeat() {
    this._sendHeartbeat();
    this._heartbeatTimer = setInterval(() => this._sendHeartbeat(), 30_000);
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  async _sendHeartbeat() {
    try {
      await this.#api.sendHeartbeat(this.path);
      await this._loadPresence();
    } catch { /* ignore — heartbeat is best-effort */ }
  }

  async _loadPresence() {
    try {
      const data = await this.#api.getPresenceChildren(this.path);
      this._presenceMap = data.children;
    } catch {
      this._presenceMap = {};
    }
  }

  /**
   * Get aggregated presence users for a given folder path.
   * Collects users from the folder path itself and all sub-paths.
   * @param {string} folderPath
   * @returns {Array<{user_id: number, display_name: string}>}
   */
  _getPresenceForFolder(folderPath) {
    const prefix = folderPath + '/';
    const seen = new Set();
    const users = [];

    for (const [path, entries] of Object.entries(this._presenceMap)) {
      if (path === folderPath || path.startsWith(prefix)) {
        for (const u of entries) {
          if (!seen.has(u.user_id)) {
            seen.add(u.user_id);
            users.push(u);
          }
        }
      }
    }
    return users;
  }

  /**
   * Build a short label for presence badge.
   * Up to 2 users: show initials. 3+: show count.
   * @param {Array<{display_name: string}>} users
   * @returns {string}
   */
  _presenceLabel(users) {
    if (users.length <= 2) {
      return users.map(u => this._getInitials(u.display_name)).join(', ');
    }
    return `${users.length} usuarios`;
  }

  /**
   * @param {string} name
   * @returns {string}
   */
  _getInitials(name) {
    return name.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  /**
   * @param {string} isoString
   * @returns {string}
   */
  _formatDate(isoString) {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  }
}

customElements.define('gd-file-explorer', GdFileExplorer);
