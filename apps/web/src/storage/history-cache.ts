import type { ConversationSummary } from '../api/contracts';

const database = 'mural-web-cache-v1', store = 'history';
function open(): Promise<IDBDatabase | undefined> {
  if (!('indexedDB' in globalThis)) return Promise.resolve(undefined);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(store);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function operation<T>(mode: IDBTransactionMode, action: (object: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  let db: IDBDatabase | undefined;
  try {
    db = await open(); if (!db) return undefined;
    return await new Promise<T>((resolve, reject) => { const request = action(db!.transaction(store, mode).objectStore(store));
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  } catch { return undefined; }
  finally { db?.close(); }
}
export const historyCache = {
  readList: (accountID: string) => operation<ConversationSummary[]>('readonly', object => object.get(`${accountID}:list`)),
  writeList: (accountID: string, value: ConversationSummary[]) => operation<IDBValidKey>('readwrite', object => object.put(value, `${accountID}:list`)),
  clear: (accountID: string) => operation<undefined>('readwrite', object => object.delete(`${accountID}:list`)),
};
