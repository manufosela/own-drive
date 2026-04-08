import { describe, it, expect, vi, beforeEach } from 'vitest';

// Polyfill customElements for Node environment
globalThis.customElements = globalThis.customElements || { define: vi.fn() };

// Mock lit
vi.mock('lit', () => {
  class MockLitElement {
    static properties = {};
    static styles = '';
    constructor() {}
    connectedCallback() {}
    requestUpdate() {}
    updated() {}
    renderRoot = { querySelector: vi.fn() };
    dispatchEvent(e) { this._lastEvent = e; }
  }
  const html = (strings, ...values) => ({ _$litType$: true, strings, values });
  const css = (strings, ...values) => strings.join('');
  return { LitElement: MockLitElement, html, css };
});

// Mock ChunkedUploader
const mockUpload = vi.fn();
vi.mock('../lib/upload-client.js', () => ({
  ChunkedUploader: class MockChunkedUploader {
    constructor() {
      this.upload = mockUpload;
    }
  },
}));

const { GdFileUpload } = await import('./gd-file-upload.js');

/** @returns {GdFileUpload} */
function createUpload() {
  const el = new GdFileUpload();
  el.dispatchEvent = vi.fn();
  return el;
}

/** Helper: create a fake File */
function fakeFile(name = 'test.stl', size = 2048) {
  return { name, size, type: 'application/octet-stream' };
}

describe('gd-file-upload', () => {
  /** @type {GdFileUpload} */
  let el;

  beforeEach(() => {
    vi.clearAllMocks();
    el = createUpload();
  });

  describe('constructor defaults', () => {
    it('should set default path to "/"', () => {
      expect(el.path).toBe('/');
    });

    it('should start with empty queue', () => {
      expect(el._queue).toEqual([]);
    });

    it('should start with _uploading = false', () => {
      expect(el._uploading).toBe(false);
    });

    it('should start with _dragOver = false', () => {
      expect(el._dragOver).toBe(false);
    });
  });

  describe('drag events', () => {
    it('should set _dragOver = true on dragover', () => {
      const ev = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
      el._onDragOver(ev);
      expect(el._dragOver).toBe(true);
      expect(ev.preventDefault).toHaveBeenCalled();
    });

    it('should set _dragOver = false on dragleave', () => {
      el._dragOver = true;
      const ev = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
      el._onDragLeave(ev);
      expect(el._dragOver).toBe(false);
    });

    it('should set _dragOver = false and add files on drop', () => {
      el._dragOver = true;
      const file = fakeFile();
      const ev = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: { files: [file] },
      };
      mockUpload.mockResolvedValue({ success: true });
      el._onDrop(ev);
      expect(el._dragOver).toBe(false);
      expect(el._queue.length).toBe(1);
      expect(el._queue[0].file).toBe(file);
    });

    it('should not add files on drop when dataTransfer is empty', () => {
      const ev = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: { files: [] },
      };
      el._onDrop(ev);
      expect(el._queue.length).toBe(0);
    });
  });

  describe('_onDropZoneKeydown', () => {
    it('should open file picker on Enter key', () => {
      const mockInput = { click: vi.fn() };
      el.renderRoot.querySelector = vi.fn().mockReturnValue(mockInput);
      const ev = { key: 'Enter', preventDefault: vi.fn() };
      el._onDropZoneKeydown(ev);
      expect(ev.preventDefault).toHaveBeenCalled();
      expect(mockInput.click).toHaveBeenCalled();
    });

    it('should open file picker on Space key', () => {
      const mockInput = { click: vi.fn() };
      el.renderRoot.querySelector = vi.fn().mockReturnValue(mockInput);
      const ev = { key: ' ', preventDefault: vi.fn() };
      el._onDropZoneKeydown(ev);
      expect(mockInput.click).toHaveBeenCalled();
    });

    it('should not open file picker on other keys', () => {
      const mockInput = { click: vi.fn() };
      el.renderRoot.querySelector = vi.fn().mockReturnValue(mockInput);
      const ev = { key: 'a', preventDefault: vi.fn() };
      el._onDropZoneKeydown(ev);
      expect(mockInput.click).not.toHaveBeenCalled();
    });
  });

  describe('_onFileSelected', () => {
    it('should add files from input and reset input value', () => {
      const file = fakeFile();
      const input = { files: [file], value: 'C:\\fake\\path' };
      mockUpload.mockResolvedValue({ success: true });
      el._onFileSelected({ target: input });
      expect(el._queue.length).toBe(1);
      expect(input.value).toBe('');
    });

    it('should not add files when input has no files', () => {
      const input = { files: null, value: '' };
      el._onFileSelected({ target: input });
      expect(el._queue.length).toBe(0);
    });
  });

  describe('_addFiles', () => {
    it('should enqueue all files and start processing immediately', () => {
      mockUpload.mockImplementation(() => new Promise(() => {})); // never resolves
      const files = [fakeFile('a.stl'), fakeFile('b.stl')];
      el._addFiles(files);
      expect(el._queue.length).toBe(2);
      // First file starts uploading immediately, second stays pending
      expect(el._queue[0].status).toBe('uploading');
      expect(el._queue[1].status).toBe('pending');
      expect(el._queue[1].percent).toBe(0);
    });
  });

  describe('_processQueue', () => {
    it('should upload files sequentially and mark them as done', async () => {
      mockUpload.mockResolvedValue({ success: true });
      el._addFiles([fakeFile('a.stl')]);
      // Wait for async queue processing
      await vi.waitFor(() => {
        expect(el._queue[0].status).toBe('done');
      });
      expect(el._queue[0].percent).toBe(100);
      expect(el._uploading).toBe(false);
    });

    it('should mark files as error on upload failure', async () => {
      mockUpload.mockResolvedValue({ success: false, error: 'Disk full' });
      el._addFiles([fakeFile('fail.stl')]);
      await vi.waitFor(() => {
        expect(el._queue[0].status).toBe('error');
      });
      expect(el._queue[0].error).toBe('Disk full');
    });

    it('should construct the correct destination path with trailing slash', async () => {
      el.path = '/datosnas/';
      mockUpload.mockResolvedValue({ success: true });
      el._addFiles([fakeFile('model.stl')]);
      await vi.waitFor(() => {
        expect(mockUpload).toHaveBeenCalled();
      });
      expect(mockUpload.mock.calls[0][1]).toBe('/datosnas/model.stl');
    });

    it('should construct the correct destination path without trailing slash', async () => {
      el.path = '/datosnas';
      mockUpload.mockResolvedValue({ success: true });
      el._addFiles([fakeFile('model.stl')]);
      await vi.waitFor(() => {
        expect(mockUpload).toHaveBeenCalled();
      });
      expect(mockUpload.mock.calls[0][1]).toBe('/datosnas/model.stl');
    });

    it('should dispatch upload-complete event with count when done', async () => {
      mockUpload.mockResolvedValue({ success: true });
      el._addFiles([fakeFile('a.stl'), fakeFile('b.stl')]);
      await vi.waitFor(() => {
        expect(el._uploading).toBe(false);
      });
      expect(el.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'upload-complete',
          detail: { count: 2, path: '/' },
        }),
      );
    });

    it('should not dispatch upload-complete when all files fail', async () => {
      mockUpload.mockResolvedValue({ success: false, error: 'err' });
      el._addFiles([fakeFile('fail.stl')]);
      await vi.waitFor(() => {
        expect(el._uploading).toBe(false);
      });
      expect(el.dispatchEvent).not.toHaveBeenCalled();
    });

    it('should not run concurrently', async () => {
      mockUpload.mockImplementation(() => new Promise((r) => setTimeout(() => r({ success: true }), 10)));
      el._addFiles([fakeFile('a.stl')]);
      // Immediately try to add more while first is in-progress
      el._addFiles([fakeFile('b.stl')]);
      // _uploading should be true
      expect(el._uploading).toBe(true);
    });

    it('should call onProgress callback during upload', async () => {
      mockUpload.mockImplementation((file, path, opts) => {
        opts.onProgress({ percent: 50 });
        return Promise.resolve({ success: true });
      });
      el._addFiles([fakeFile('progress.stl')]);
      await vi.waitFor(() => {
        expect(el._queue[0].status).toBe('done');
      });
      // The onProgress was called, which updates the entry's percent
      // Final state is 100% because it's done
      expect(el._queue[0].percent).toBe(100);
    });
  });

  describe('_updateEntry', () => {
    it('should update only the specified entry', () => {
      el._queue = [
        { file: fakeFile('a.stl'), status: 'pending', percent: 0 },
        { file: fakeFile('b.stl'), status: 'pending', percent: 0 },
      ];
      el._updateEntry(0, { status: 'uploading', percent: 25 });
      expect(el._queue[0].status).toBe('uploading');
      expect(el._queue[0].percent).toBe(25);
      expect(el._queue[1].status).toBe('pending');
    });
  });

  describe('_formatSize', () => {
    it('should format bytes', () => {
      expect(el._formatSize(500)).toBe('500 B');
    });

    it('should format kilobytes', () => {
      expect(el._formatSize(2048)).toBe('2.0 KB');
    });

    it('should format megabytes', () => {
      expect(el._formatSize(5 * 1024 * 1024)).toBe('5.0 MB');
    });

    it('should format gigabytes', () => {
      expect(el._formatSize(2 * 1024 * 1024 * 1024)).toBe('2.0 GB');
    });
  });

  describe('compact horizontal bar layout', () => {
    it('should have styles for horizontal flex layout', () => {
      // The static styles should define a horizontal drop-zone layout
      const styles = GdFileUpload.styles;
      expect(styles).toContain('display: flex');
      expect(styles).toContain('align-items: center');
    });

    it('should render the drop zone with role=button for accessibility', () => {
      const result = el.render();
      // The template should contain role="button"
      const templateStr = result.strings.join('');
      expect(templateStr).toContain('role="button"');
    });

    it('should render aria-label on the drop zone', () => {
      const result = el.render();
      const templateStr = result.strings.join('');
      expect(templateStr).toContain('aria-label');
    });

    it('should render upload icon SVG', () => {
      const result = el.render();
      const templateStr = result.strings.join('');
      expect(templateStr).toContain('<svg');
      expect(templateStr).toContain('drop-zone-icon');
    });

    it('should have compact padding in styles', () => {
      const styles = GdFileUpload.styles;
      expect(styles).toContain('padding: 11px 16px');
    });
  });
});
