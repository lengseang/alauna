// In-memory stand-in for expo-file-system (the new File/Directory/Paths API) - just enough for services/*.
// State lives on globalThis.__fakeFs so a test can inspect or pre-seed it.
const store = new Map(); // path -> { type: 'file', content: string, size?: number } | { type: 'dir' }
globalThis.__fakeFs = {
  store,
  reset() { store.clear(); },
  /** Pre-seed a "downloaded" model: GGUF magic + a reported size. */
  putModel(path, size) { store.set(path, { type: 'file', content: 'GGUF' + 'x'.repeat(28), size }); },
  read(path) { const e = store.get(path); return e && e.type === 'file' ? e.content : null; },
  list(prefix) { return [...store.keys()].filter((k) => k.startsWith(prefix)); },
};

const DOC = '/data/user/0/com.chiwiwi.sovereign/files';

function toPath(x) {
  if (typeof x !== 'string') return x.path;
  let p = x.replace(/^file:\/\//, '');
  try { p = decodeURIComponent(p); } catch { /* keep */ }
  return p;
}
const clean = (p) => p.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
const parentOf = (p) => p.slice(0, p.lastIndexOf('/')) || '/';

function mkdirs(path) {
  let cur = '';
  for (const seg of path.split('/').filter(Boolean)) {
    cur += '/' + seg;
    if (!store.has(cur)) store.set(cur, { type: 'dir' });
  }
}

class Base {
  constructor(...parts) { this.path = clean(parts.map(toPath).join('/')); }
  get uri() { return 'file://' + encodeURI(this.path); }
  get name() { return this.path.slice(this.path.lastIndexOf('/') + 1); }
}

class File extends Base {
  get exists() { const e = store.get(this.path); return !!e && e.type === 'file'; }
  get size() { const e = store.get(this.path); return e && e.type === 'file' ? (e.size ?? e.content.length) : 0; }
  create() { mkdirs(parentOf(this.path)); if (!this.exists) store.set(this.path, { type: 'file', content: '' }); }
  write(text) { mkdirs(parentOf(this.path)); store.set(this.path, { type: 'file', content: String(text) }); }
  async text() { if (!this.exists) throw new Error('ENOENT ' + this.path); return store.get(this.path).content; }
  textSync() { if (!this.exists) throw new Error('ENOENT ' + this.path); return store.get(this.path).content; }
  delete() { store.delete(this.path); }
  rename(newName) {
    const dest = parentOf(this.path) + '/' + newName;
    if (store.has(dest)) throw new Error('destination exists: ' + dest);
    store.set(dest, store.get(this.path));
    store.delete(this.path);
    this.path = dest;
  }
  open() {
    const bytes = Buffer.from(this.exists ? store.get(this.path).content : '', 'latin1');
    let pos = 0;
    return { readBytes(n) { const out = bytes.subarray(pos, pos + n); pos += out.length; return new Uint8Array(out); }, close() {} };
  }
}

class Directory extends Base {
  get exists() { const e = store.get(this.path); return !!e && e.type === 'dir'; }
  create() { mkdirs(this.path); }
  list() {
    const out = [];
    for (const [k, v] of store) {
      if (k !== this.path && parentOf(k) === this.path) out.push(v.type === 'dir' ? new Directory(k) : new File(k));
    }
    return out;
  }
  static async pickDirectoryAsync() { throw new Error('cancelled'); }
}

const documentDir = new Directory(DOC);
mkdirs(DOC);

exports.File = File;
exports.Directory = Directory;
exports.Paths = { document: documentDir, availableDiskSpace: 50e9 };
exports.FileMode = { ReadOnly: 'r', WriteOnly: 'w' };
exports.DownloadTask = class DownloadTask {};
