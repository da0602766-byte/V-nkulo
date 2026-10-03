const DATABASE_NAME = "vinkulo-private-media";
const STORE_NAME = "files";
import { contentHash } from "./file-copy";

export type LocalMedia = { id: string; blob: Blob; name: string; type: string; size: number; savedAt: string; ownerId?: number };

export async function storeLocalMedia(file: File, ownerId?: number, deduplicate = false) {
  const id = deduplicate && ownerId ? `${ownerId}-${await contentHash(file)}` : crypto.randomUUID();
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({
      id,
      blob: file,
      name: file.name,
      type: file.type,
      size: file.size,
      savedAt: new Date().toISOString(),
      ownerId,
    });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Não foi possível salvar no aparelho."));
  });
  database.close();
  return `/local-media/${id}`;
}

export async function readLocalMedia(source: string): Promise<LocalMedia> {
  const id = source.split("/local-media/")[1]?.split("?")[0];
  if (!id) throw new Error("Arquivo local inválido.");
  const database = await openDatabase();
  try {
    const record = await new Promise<LocalMedia | undefined>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!record?.blob) throw new Error("Este arquivo está no aparelho onde foi salvo. Abra por lá ou use uma cópia do Drive.");
    return record;
  } finally { database.close(); }
}

export async function listLocalMedia(ownerId: number, legacyProfile = "") {
  const database = await openDatabase();
  try {
    const records = await new Promise<LocalMedia[]>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return records.filter(record => record.ownerId === ownerId || (!record.ownerId && legacyProfile === `/local-media/${record.id}`))
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  } finally { database.close(); }
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Armazenamento local indisponível."));
  });
}
