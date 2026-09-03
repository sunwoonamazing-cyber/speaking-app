import { openDB } from 'idb'

export const DB_NAME = 'speaking-app'
export const DB_VERSION = 1

/**
 * 저장소 구조.
 * 앞으로 쓸 스토어(폴더/카드/세션/음성캐시)까지 지금 한 번에 만들어 둔다.
 * 폰에 데이터가 쌓인 뒤에 버전을 올리며 마이그레이션하는 위험을 줄이기 위함.
 */
let dbPromise = null

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('settings')) {
          // 전역 설정: { key, value }
          db.createObjectStore('settings', { keyPath: 'key' })
        }

        if (!db.objectStoreNames.contains('folders')) {
          const s = db.createObjectStore('folders', { keyPath: 'id' })
          s.createIndex('sort_order', 'sort_order')
          s.createIndex('created_at', 'created_at')
        }

        if (!db.objectStoreNames.contains('cards')) {
          const s = db.createObjectStore('cards', { keyPath: 'id' })
          s.createIndex('folder_id', 'folder_id')
          s.createIndex('status', 'status')
          s.createIndex('review_due_date', 'review_due_date')
          s.createIndex('created_at', 'created_at')
          // 폴더 안에서 상태별로 뽑는 조회가 잦아 복합 인덱스를 둔다
          s.createIndex('folder_status', ['folder_id', 'status'])
        }

        if (!db.objectStoreNames.contains('sessions')) {
          // 오늘의 학습 세션: 폴더별로 하루 한 건. id = `${folder_id}:${date}`
          const s = db.createObjectStore('sessions', { keyPath: 'id' })
          s.createIndex('folder_id', 'folder_id')
          s.createIndex('date', 'date')
        }

        if (!db.objectStoreNames.contains('tts_cache')) {
          // 원어민 발음 캐시: { key, blob, created_at }
          const s = db.createObjectStore('tts_cache', { keyPath: 'key' })
          s.createIndex('created_at', 'created_at')
        }
      },
    })
  }
  return dbPromise
}

/**
 * 저장소 영구 보관 요청.
 * 명세: 페이지 로딩 시점이 아니라 사용자가 버튼을 누른 직후에 호출한다.
 */
export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return { supported: false, granted: false }
  try {
    const granted = await navigator.storage.persist()
    return { supported: true, granted }
  } catch {
    return { supported: true, granted: false, error: true }
  }
}

export async function isStoragePersisted() {
  if (!navigator.storage?.persisted) return { supported: false, granted: false }
  try {
    return { supported: true, granted: await navigator.storage.persisted() }
  } catch {
    return { supported: true, granted: false, error: true }
  }
}

export async function getStorageEstimate() {
  if (!navigator.storage?.estimate) return null
  try {
    return await navigator.storage.estimate()
  } catch {
    return null
  }
}
