import { getDB } from './db.js'
import { pickUnusedColor } from './colors.js'
import { todayStr } from './dates.js'

const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`

export const DEFAULT_DAILY_TARGET = 50

/* ------------------------------------------------------------------ */
/* 폴더                                                                 */
/* ------------------------------------------------------------------ */

export async function listFolders() {
  const db = await getDB()
  const all = await db.getAll('folders')
  return all.sort(
    (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)
  )
}

export async function getFolder(id) {
  const db = await getDB()
  return db.get('folders', id)
}

export async function createFolder({
  name,
  color,
  daily_target = DEFAULT_DAILY_TARGET,
  default_mode = 'speak',
}) {
  const db = await getDB()
  const folders = await listFolders()
  const folder = {
    id: uid(),
    name: name.trim(),
    color: color || pickUnusedColor(folders),
    daily_target,
    default_mode,
    sort_order: folders.length ? Math.max(...folders.map((f) => f.sort_order)) + 1 : 0,
    created_at: new Date().toISOString(),
  }
  await db.put('folders', folder)
  return folder
}

export async function updateFolder(id, patch) {
  const db = await getDB()
  const folder = await db.get('folders', id)
  if (!folder) return null
  const next = { ...folder, ...patch }
  if (typeof next.name === 'string') next.name = next.name.trim()
  await db.put('folders', next)
  return next
}

/** 목록에서 한 칸 위/아래로 옮긴다. 이웃과 sort_order를 맞바꾸는 방식. */
export async function moveFolder(id, direction) {
  const folders = await listFolders()
  const i = folders.findIndex((f) => f.id === id)
  const j = direction === 'up' ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= folders.length) return false

  const db = await getDB()
  const tx = db.transaction('folders', 'readwrite')
  // 저장된 sort_order 값이 서로 같거나 비어 있어도 안전하도록 순서를 통째로 다시 매긴다
  const reordered = [...folders]
  ;[reordered[i], reordered[j]] = [reordered[j], reordered[i]]
  await Promise.all(reordered.map((f, idx) => tx.store.put({ ...f, sort_order: idx })))
  await tx.done
  return true
}

/**
 * 폴더 삭제. 안에 든 카드를 어떻게 할지 반드시 정해서 넘겨야 한다.
 * cardAction: 'delete' 함께 삭제 | 'move' 다른 폴더로 옮기기(targetFolderId 필요)
 */
export async function deleteFolder(id, { cardAction, targetFolderId } = {}) {
  const db = await getDB()
  const cards = await db.getAllFromIndex('cards', 'folder_id', id)

  if (cards.length > 0) {
    if (cardAction === 'move') {
      if (!targetFolderId || targetFolderId === id) {
        throw new Error('옮길 폴더를 골라야 합니다.')
      }
      const target = await db.get('folders', targetFolderId)
      if (!target) throw new Error('옮길 폴더를 찾지 못했습니다.')
    } else if (cardAction !== 'delete') {
      throw new Error('카드를 어떻게 할지 정해야 합니다.')
    }
  }

  // 트랜잭션 안에서는 순차 await를 피한다 — 중간에 이벤트 루프로 넘어가면
  // 브라우저가 트랜잭션을 닫아버려 일부만 반영될 수 있다
  const tx = db.transaction(['folders', 'cards'], 'readwrite')
  const cardStore = tx.objectStore('cards')
  const ops = cards.map((card) =>
    cardAction === 'move'
      ? cardStore.put({ ...card, folder_id: targetFolderId })
      : cardStore.delete(card.id)
  )
  ops.push(tx.objectStore('folders').delete(id))
  await Promise.all(ops)
  await tx.done

  // 삭제 후 순서를 촘촘하게 다시 매긴다
  const rest = await listFolders()
  const tx2 = db.transaction('folders', 'readwrite')
  await Promise.all(rest.map((f, idx) => tx2.store.put({ ...f, sort_order: idx })))
  await tx2.done
}

/* ------------------------------------------------------------------ */
/* 카드                                                                 */
/* ------------------------------------------------------------------ */

export function makeCard({ folder_id, korean_text, english_text }) {
  return {
    id: uid(),
    folder_id,
    korean_text: korean_text.trim(),
    english_text: english_text.trim(),
    created_at: new Date().toISOString(),

    status: 'new', // new | learning | completed
    flagged: false,
    review_due_date: null, // 아직 안 본 카드는 예정일이 없다

    // SM-2 (7단계에서 사용)
    interval: 0,
    repetitions: 0,
    ease_factor: 2.5,

    last_scores: null,
    last_avg_score: null,
    last_mode: null, // speak | type

    attempt_count: 0, // 화면에 보이는 복습 횟수 배지
    fail_count: 0,
  }
}

export async function listCards(folderId) {
  const db = await getDB()
  const cards = await db.getAllFromIndex('cards', 'folder_id', folderId)
  return cards.sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export async function listAllCards() {
  const db = await getDB()
  return db.getAll('cards')
}

export async function getCard(id) {
  const db = await getDB()
  return db.get('cards', id)
}

export async function createCard({ folder_id, korean_text, english_text }) {
  const db = await getDB()
  const card = makeCard({ folder_id, korean_text, english_text })
  await db.put('cards', card)
  return card
}

export async function updateCard(id, patch) {
  const db = await getDB()
  const card = await db.get('cards', id)
  if (!card) return null
  const next = { ...card, ...patch }
  if (typeof next.korean_text === 'string') next.korean_text = next.korean_text.trim()
  if (typeof next.english_text === 'string') next.english_text = next.english_text.trim()
  await db.put('cards', next)
  return next
}

export async function deleteCard(id) {
  const db = await getDB()
  await db.delete('cards', id)
}

/* ------------------------------------------------------------------ */
/* 집계                                                                 */
/* ------------------------------------------------------------------ */

/**
 * 오늘 학습할 카드 수.
 * 명세의 묶음 구성 규칙을 그대로 따른다 — 새 카드를 먼저 채우고,
 * 남은 자리는 복습일이 지난 카드로 채우되, 아직 복습일이 안 된 카드는 끌어오지 않는다.
 * 그래서 목표보다 적을 수 있다.
 */
export function countDueToday(cards, dailyTarget = DEFAULT_DAILY_TARGET, today = todayStr()) {
  let newCount = 0
  let dueCount = 0
  for (const c of cards) {
    if (c.status === 'new') newCount += 1
    else if (c.status === 'learning' && c.review_due_date && c.review_due_date <= today) {
      dueCount += 1
    }
  }
  return Math.min(newCount + dueCount, dailyTarget)
}

/** 폴더 목록 화면에 필요한 폴더별 숫자 묶음 */
export function summarizeFolders(folders, allCards, today = todayStr()) {
  const byFolder = new Map(folders.map((f) => [f.id, []]))
  for (const card of allCards) {
    const bucket = byFolder.get(card.folder_id)
    if (bucket) bucket.push(card)
  }
  return folders.map((folder) => {
    const cards = byFolder.get(folder.id) || []
    return {
      folder,
      total: cards.length,
      completed: cards.filter((c) => c.status === 'completed').length,
      today: countDueToday(cards, folder.daily_target, today),
    }
  })
}
