import type { CredentialVault, SavedCredential } from './vault';

const DB = 'qhub-vault';
const STORE = 'keys';
const KEY_ID = 'aes-gcm-v1';
const item = (orgId: string) => `qhub.vault.${orgId}`;

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf))));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const idb = <T,>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
  openDb().then((db) => new Promise<T>((resolve, reject) => { const tx = db.transaction(STORE, mode); const r = run(tx.objectStore(STORE)); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); tx.oncomplete = () => db.close(); }));

/** Clave AES-GCM de 256 bits **no extraíble**, guardada como objeto en IndexedDB: el navegador la usa pero nadie puede leerla. */
async function key(create: boolean): Promise<CryptoKey | null> {
  const found = await idb<CryptoKey | undefined>('readonly', (s) => s.get(KEY_ID));
  if (found) return found;
  if (!create) return null;
  const fresh = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await idb('readwrite', (s) => s.put(fresh, KEY_ID));
  return fresh;
}

export class DeviceCredentialVault implements CredentialVault {
  isSupported() { try { return typeof indexedDB !== 'undefined' && !!globalThis.crypto?.subtle && typeof localStorage !== 'undefined'; } catch { return false; } }

  async save(orgId: string, c: SavedCredential): Promise<boolean> {
    if (!this.isSupported()) return false;
    try {
      const k = await key(true);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k!, new TextEncoder().encode(JSON.stringify(c)));
      localStorage.setItem(item(orgId), JSON.stringify({ v: 1, iv: b64(iv), d: b64(data) }));
      return true;
    } catch { return false; }
  }

  async load(orgId: string): Promise<SavedCredential | null> {
    if (!this.isSupported()) return null;
    try {
      const raw = localStorage.getItem(item(orgId));
      if (!raw) return null;
      const { iv, d } = JSON.parse(raw) as { iv: string; d: string };
      const k = await key(false);
      if (!k) return null;
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, k, unb64(d));
      const c = JSON.parse(new TextDecoder().decode(plain)) as SavedCredential;
      return c.identifier && c.password ? c : null;
    } catch { return null; }
  }

  async has(orgId: string): Promise<boolean> { try { return this.isSupported() && localStorage.getItem(item(orgId)) !== null; } catch { return false; } }
  async clear(orgId: string): Promise<void> { try { localStorage.removeItem(item(orgId)); } catch { /* sin storage */ } }
}
