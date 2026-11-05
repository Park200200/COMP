/**
 * 이미지 데이터(Base64) IndexedDB 저장소
 * localStorage QuotaExceededError 방지를 위해 이미지를 IndexedDB에 분리 저장
 */

const DB_NAME = 'COMP_ImageStore';
const DB_VERSION = 1;
const STORE_NAME = 'atom_images';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 이미지 값 저장 (atomId → base64 string) */
export async function saveAtomImage(atomId: string, base64: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(base64, atomId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** 이미지 값 삭제 */
export async function deleteAtomImage(atomId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(atomId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** 이미지 값 단건 조회 */
export async function getAtomImage(atomId: string): Promise<string | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(atomId);
    req.onsuccess = () => resolve(req.result as string | undefined);
    req.onerror = () => reject(req.error);
  });
}

/** 전체 이미지 맵 조회 { atomId: base64 } */
export async function getAllAtomImages(): Promise<Record<string, string>> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const result: Record<string, string> = {};
    const curReq = store.openCursor();
    curReq.onsuccess = () => {
      const cur = curReq.result;
      if (cur) {
        result[cur.key as string] = cur.value as string;
        cur.continue();
      } else {
        resolve(result);
      }
    };
    curReq.onerror = () => reject(curReq.error);
  });
}

/** 이미지 맵 통째로 저장 (마이그레이션용) */
export async function saveAllAtomImages(map: Record<string, string>): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    Object.entries(map).forEach(([id, val]) => store.put(val, id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** localStorage → IndexedDB 이미지 일회성 마이그레이션 */
export async function migrateLocalStorageImages(): Promise<void> {
  const old = localStorage.getItem('COMP_v3_atom_images');
  if (!old) return;
  try {
    const map: Record<string, string> = JSON.parse(old);
    if (Object.keys(map).length > 0) {
      await saveAllAtomImages(map);
    }
    localStorage.removeItem('COMP_v3_atom_images');
    console.log('[imageStorage] localStorage 이미지 마이그레이션 완료');
  } catch (e) {
    console.warn('[imageStorage] 마이그레이션 실패:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 로컬 파일 기반 이미지 저장 API
// ═══════════════════════════════════════════════════════════════════════════

/** base64 dataURL을 서버에 POST → 로컬 파일로 저장 → 경로 반환 */
export async function uploadImageToLocal(base64DataUrl: string): Promise<string> {
  const res = await fetch('/api/upload-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: base64DataUrl }),
  });
  if (!res.ok) {
    throw new Error(`Image upload failed: ${res.status}`);
  }
  const { path } = await res.json();
  return path; // "/local-images/img-xxx.jpg"
}

/** IndexedDB base64 이미지를 로컬 파일로 일괄 마이그레이션 → { atomId: path } 반환 */
export async function migrateIDBImagesToFiles(): Promise<Record<string, string>> {
  const imgMap = await getAllAtomImages();
  if (Object.keys(imgMap).length === 0) return {};

  console.log(`[imageStorage] IndexedDB → 로컬 파일 마이그레이션 시작 (${Object.keys(imgMap).length}건)`);
  const res = await fetch('/api/migrate-images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images: imgMap }),
  });
  if (!res.ok) {
    throw new Error(`Image migration failed: ${res.status}`);
  }
  const { migrated } = await res.json();

  // 마이그레이션 완료된 이미지는 IndexedDB에서 삭제
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const atomId of Object.keys(migrated)) {
      store.delete(atomId);
    }
    tx.oncomplete = () => {
      console.log(`[imageStorage] IndexedDB → 로컬 파일 마이그레이션 완료 (${Object.keys(migrated).length}건)`);
      resolve(migrated as Record<string, string>);
    };
    tx.onerror = () => reject(tx.error);
  });
}

/** 값이 로컬 이미지 경로인지 확인 */
export function isLocalImagePath(value: string): boolean {
  return typeof value === 'string' && value.startsWith('/local-images/');
}

/** 저장된 로컬 이미지 파일 목록 조회 */
export async function getLocalImagesList(): Promise<string[]> {
  try {
    const res = await fetch('/api/list-local-images');
    if (!res.ok) return [];
    const data = await res.json();
    return data.files || [];
  } catch {
    return [];
  }
}

/** 아톰 ID 또는 엔티티 앵커 ID로 로컬 이미지 파일 매칭 */
export function findMatchingLocalImage(identifier: string, fileList: string[]): string | undefined {
  if (!identifier || fileList.length === 0) return undefined;
  const cleanId = identifier.replace(/[^a-zA-Z0-9-_]/g, '');
  if (!cleanId) return undefined;

  // 1. 완벽 포함 매칭
  const exact = fileList.find(f => f.includes(cleanId));
  if (exact) return `/local-images/${exact}`;

  // 2. 접두사 매칭 (예: e-dom3im2x-kiyrwh)
  const basePrefix = cleanId.split('-').slice(0, 3).join('-');
  if (basePrefix.length >= 8) {
    const matched = fileList.find(f => f.includes(basePrefix));
    if (matched) return `/local-images/${matched}`;
  }

  return undefined;
}
