/**
 * Archivio locale del cantiere (IndexedDB `aph-field`, AFU FR-M4-14 / BR-24): file in attesa di invio,
 * operazioni sul verbale fatte senza rete e ultima copia di ogni sopralluogo aperto, per lavorare
 * anche offline. Se IndexedDB non è disponibile (navigazione privata) tutto resta solo in memoria.
 */
export type FieldStore = 'uploads' | 'ops' | 'visits';

const DB_NAME = 'aph-field';
const DB_VERSION = 2;
const STORES: FieldStore[] = ['uploads', 'ops', 'visits'];

let connection: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      for (const name of STORES) {
        if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((error: unknown) => {
    connection = null;
    throw error;
  });
  return connection;
}

async function request<T>(store: FieldStore, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const req = run(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function idbAll<T>(store: FieldStore): Promise<T[]> {
  return request(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
}

export function idbGet<T>(store: FieldStore, id: string): Promise<T | undefined> {
  return request(store, 'readonly', (s) => s.get(id) as IDBRequest<T | undefined>);
}

export async function idbPut<T extends { id: string }>(store: FieldStore, value: T): Promise<void> {
  await request(store, 'readwrite', (s) => s.put(value));
}

export async function idbDelete(store: FieldStore, id: string): Promise<void> {
  await request(store, 'readwrite', (s) => s.delete(id));
}
