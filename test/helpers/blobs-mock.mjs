/* In-memory stand-in for @netlify/blobs, for tests outside Netlify's runtime. */
const stores = new Map();

export function getStore(name) {
  if (!stores.has(name)) stores.set(name, new Map());
  const backing = stores.get(name);
  return {
    async setJSON(key, value) {
      backing.set(key, JSON.parse(JSON.stringify(value)));
      return { modified: true };
    },
    async get(key, { type } = {}) {
      const v = backing.has(key) ? backing.get(key) : null;
      if (v === null) return null;
      return type === "json" ? v : JSON.stringify(v);
    },
    async delete(key) {
      backing.delete(key);
    },
    async list() {
      return { blobs: [...backing.keys()].map((key) => ({ key })), directories: [] };
    },
  };
}

export function __reset() {
  stores.clear();
}
