// Tiny IndexedDB wrapper. Everything the app stores - measurements, garment
// photos, the current outfit - lives in the browser. Nothing is uploaded.

const DB = 'virtual-closet';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('items', { keyPath: 'id' });
      req.result.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => resolve(result.result ?? result);
    t.onerror = () => reject(t.error);
  }));
}

export const db = {
  listItems: () => tx('items', 'readonly', (s) => s.getAll()),
  putItem: (item) => tx('items', 'readwrite', (s) => s.put(item)),
  deleteItem: (id) => tx('items', 'readwrite', (s) => s.delete(id)),
  getKV: (key) => tx('kv', 'readonly', (s) => s.get(key)),
  setKV: (key, value) => tx('kv', 'readwrite', (s) => s.put(value, key)),
};
