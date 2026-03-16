import type { Topic, PracticeMaterial, PracticeSession } from '../types';

const DB_NAME    = 'InterpreterScoringDB';
const DB_VERSION = 2; // 升版本触发 onupgradeneeded

let db: IDBDatabase | null = null;

export async function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (db) { resolve(db); return; }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror   = () => reject(request.error);
    request.onsuccess = () => { db = request.result; resolve(db); };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      if (!database.objectStoreNames.contains('topics')) {
        const s = database.createObjectStore('topics', { keyPath: 'id' });
        s.createIndex('name', 'name', { unique: false });
      }
      if (!database.objectStoreNames.contains('materials')) {
        const s = database.createObjectStore('materials', { keyPath: 'id' });
        s.createIndex('topicId', 'topicId', { unique: false });
      }
      if (!database.objectStoreNames.contains('sessions')) {
        const s = database.createObjectStore('sessions', { keyPath: 'id' });
        s.createIndex('materialId', 'materialId', { unique: false });
        s.createIndex('topicId',    'topicId',    { unique: false });
      }
    };
  });
}

async function getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
  const database = await initDB();
  return database.transaction(storeName, mode).objectStore(storeName);
}

// ── Topics ────────────────────────────────────────────────────

export async function getAllTopics(): Promise<Topic[]> {
  const store = await getStore('topics');
  return new Promise((resolve, reject) => {
    const r = store.getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror   = () => reject(r.error);
  });
}

export async function getTopic(id: string): Promise<Topic | undefined> {
  const store = await getStore('topics');
  return new Promise((resolve, reject) => {
    const r = store.get(id);
    r.onsuccess = () => resolve(r.result);
    r.onerror   = () => reject(r.error);
  });
}

export async function saveTopic(topic: Topic): Promise<void> {
  const store = await getStore('topics', 'readwrite');
  return new Promise((resolve, reject) => {
    const r = store.put(topic);
    r.onsuccess = () => resolve();
    r.onerror   = () => reject(r.error);
  });
}

export async function deleteTopic(id: string): Promise<void> {
  const store = await getStore('topics', 'readwrite');
  return new Promise((resolve, reject) => {
    const r = store.delete(id);
    r.onsuccess = () => resolve();
    r.onerror   = () => reject(r.error);
  });
}

// ── Materials ─────────────────────────────────────────────────

export async function getAllMaterials(): Promise<PracticeMaterial[]> {
  const store = await getStore('materials');
  return new Promise((resolve, reject) => {
    const r = store.getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror   = () => reject(r.error);
  });
}

export async function getMaterialsByTopic(topicId: string): Promise<PracticeMaterial[]> {
  const store = await getStore('materials');
  const index = store.index('topicId');
  return new Promise((resolve, reject) => {
    const r = index.getAll(topicId);
    r.onsuccess = () => resolve(r.result);
    r.onerror   = () => reject(r.error);
  });
}

export async function getMaterial(id: string): Promise<PracticeMaterial | undefined> {
  const store = await getStore('materials');
  return new Promise((resolve, reject) => {
    const r = store.get(id);
    r.onsuccess = () => resolve(r.result);
    r.onerror   = () => reject(r.error);
  });
}

export async function saveMaterial(material: PracticeMaterial): Promise<void> {
  const store = await getStore('materials', 'readwrite');
  return new Promise((resolve, reject) => {
    const r = store.put(material);
    r.onsuccess = () => resolve();
    r.onerror   = () => reject(r.error);
  });
}

export async function deleteMaterial(id: string): Promise<void> {
  const store = await getStore('materials', 'readwrite');
  return new Promise((resolve, reject) => {
    const r = store.delete(id);
    r.onsuccess = () => resolve();
    r.onerror   = () => reject(r.error);
  });
}

// ── Sessions ──────────────────────────────────────────────────

export async function getAllSessions(): Promise<PracticeSession[]> {
  const store = await getStore('sessions');
  return new Promise((resolve, reject) => {
    const r = store.getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror   = () => reject(r.error);
  });
}

export async function getSessionsByMaterial(materialId: string): Promise<PracticeSession[]> {
  const store = await getStore('sessions');
  const index = store.index('materialId');
  return new Promise((resolve, reject) => {
    const r = index.getAll(materialId);
    r.onsuccess = () => resolve(r.result);
    r.onerror   = () => reject(r.error);
  });
}

export async function saveSession(session: PracticeSession): Promise<void> {
  const store = await getStore('sessions', 'readwrite');
  return new Promise((resolve, reject) => {
    const r = store.put(session);
    r.onsuccess = () => resolve();
    r.onerror   = () => reject(r.error);
  });
}

export async function deleteSession(id: string): Promise<void> {
  const store = await getStore('sessions', 'readwrite');
  return new Promise((resolve, reject) => {
    const r = store.delete(id);
    r.onsuccess = () => resolve();
    r.onerror   = () => reject(r.error);
  });
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}