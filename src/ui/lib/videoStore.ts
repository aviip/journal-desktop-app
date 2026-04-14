type StoredBlob = { id: string; blob: Blob };

const DB_NAME = "journal.videoBlobs.v1";
const STORE_NAME = "blobs";

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });
}

export async function putVideoBlob(blob: Blob): Promise<string> {
  const db = await openDb();
  const id = randomId();

  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    await requestToPromise(store.put({ id, blob } satisfies StoredBlob));
    await txDone(tx);
    return id;
  } finally {
    db.close();
  }
}

export async function getVideoBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const res = await requestToPromise<StoredBlob | undefined>(store.get(id));
    await txDone(tx);
    return res?.blob ?? null;
  } finally {
    db.close();
  }
}

export async function deleteVideoBlob(id: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    await requestToPromise(store.delete(id));
    await txDone(tx);
  } finally {
    db.close();
  }
}
