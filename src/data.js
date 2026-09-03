import { getDB } from './db.js'
import { pickUnusedColor } from './colors.js'
import { addDays, todayStr } from './dates.js'
import { priorityScore } from './sm2.js'

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
/* 오늘의 묶음                                                          */
/* ------------------------------------------------------------------ */

/**
 * 오늘 볼 카드 묶음을 만든다. 명세의 순서를 그대로 따른다.
 *
 * 1. 새 카드를 먼저 채운다 — 등록한 순서(오래된 것부터)
 * 2. 남은 자리를 복습이 필요한 카드로 채운다 — 우선순위 점수가 높은 순
 * 3. 목표에 못 미쳐도 아직 복습일이 안 된 카드는 끌어오지 않는다
 *    ("오늘은 30개로 끝"이 정상 동작이다)
 * 4. 새 카드만으로 목표를 넘으면 넘치는 새 카드는 다음 날로 미룬다
 */
export function buildTodayBundle(cards, dailyTarget, today = todayStr(), excludeIds = new Set()) {
  const pool = cards.filter((c) => c.status !== 'completed' && !excludeIds.has(c.id))

  const fresh = pool
    .filter((c) => c.status === 'new')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  const due = pool
    .filter((c) => c.status === 'learning' && c.review_due_date && c.review_due_date <= today)
    .sort(
      (a, b) =>
        priorityScore(b, today) - priorityScore(a, today) ||
        a.created_at.localeCompare(b.created_at) // 동점이면 먼저 등록한 카드가 앞
    )

  return [...fresh, ...due].slice(0, dailyTarget).map((c) => c.id)
}

/** 오늘 학습할 카드 수 (폴더 목록·상세 화면 표시용) */
export function countDueToday(cards, dailyTarget = DEFAULT_DAILY_TARGET, today = todayStr()) {
  return buildTodayBundle(cards, dailyTarget, today).length
}

/* ------------------------------------------------------------------ */
/* 학습 세션 — 폴더별로 하루에 하나                                       */
/* ------------------------------------------------------------------ */

export function sessionId(folderId, date) {
  return `${folderId}:${date}`
}

export async function getSession(folderId, today = todayStr()) {
  const db = await getDB()
  return (await db.get('sessions', sessionId(folderId, today))) || null
}

/**
 * 오늘 세션을 가져오고, 없으면 새로 만든다.
 * 한 번 만든 묶음은 그날 하루 고정이다 — 앱을 껐다 켜도 같은 목록에서 이어진다.
 */
export async function startOrResumeSession(folderId, today = todayStr()) {
  const db = await getDB()
  const id = sessionId(folderId, today)

  const existing = await db.get('sessions', id)
  if (existing) return existing

  const folder = await db.get('folders', folderId)
  const cards = await listCards(folderId)
  const card_ids = buildTodayBundle(cards, folder?.daily_target || DEFAULT_DAILY_TARGET, today)

  const session = {
    id,
    folder_id: folderId,
    date: today,
    card_ids,
    current_index: 0,
    completed: card_ids.length === 0,
  }
  await db.put('sessions', session)
  pruneOldSessions(today) // 지난 세션이 쌓이지 않게 뒤에서 정리한다
  return session
}

export async function updateSession(id, patch) {
  const db = await getDB()
  const session = await db.get('sessions', id)
  if (!session) return null
  const next = { ...session, ...patch }
  await db.put('sessions', next)
  return next
}

/**
 * 오늘 몫을 끝낸 뒤 "더 하기".
 * 이미 본 카드는 빼고 같은 규칙으로 다음 묶음을 만들어 뒤에 붙인다.
 */
export async function extendSession(session, today = todayStr()) {
  const db = await getDB()
  const folder = await db.get('folders', session.folder_id)
  const cards = await listCards(session.folder_id)
  const more = buildTodayBundle(
    cards,
    folder?.daily_target || DEFAULT_DAILY_TARGET,
    today,
    new Set(session.card_ids)
  )
  if (more.length === 0) return { session, added: 0 }

  const next = await updateSession(session.id, {
    card_ids: [...session.card_ids, ...more],
    completed: false,
  })
  return { session: next, added: more.length }
}

/** 30일보다 오래된 세션은 지운다 (실패해도 학습에는 지장이 없다) */
async function pruneOldSessions(today = todayStr()) {
  try {
    const db = await getDB()
    const cutoff = addDays(today, -30)
    const all = await db.getAll('sessions')
    const old = all.filter((s) => s.date < cutoff)
    if (old.length === 0) return
    const tx = db.transaction('sessions', 'readwrite')
    await Promise.all(old.map((s) => tx.store.delete(s.id)))
    await tx.done
  } catch {
    // 정리에 실패해도 그냥 둔다
  }
}

/** 세션의 카드 순서를 지킨 채 카드를 읽어온다. 그새 지워진 카드는 건너뛴다. */
export async function loadSessionCards(cardIds) {
  const db = await getDB()
  const rows = await Promise.all(cardIds.map((id) => db.get('cards', id)))
  return rows.filter(Boolean)
}

/* ------------------------------------------------------------------ */
/* 폴더 목록 집계                                                        */
/* ------------------------------------------------------------------ */

/**
 * 폴더 목록 화면에 필요한 숫자들.
 * 오늘 세션이 이미 있으면 "남은 장수"를, 없으면 오늘 볼 장수를 보여준다.
 */
export function summarizeFolders(folders, allCards, sessions = [], today = todayStr()) {
  const byFolder = new Map(folders.map((f) => [f.id, []]))
  for (const card of allCards) {
    const bucket = byFolder.get(card.folder_id)
    if (bucket) bucket.push(card)
  }
  const sessionByFolder = new Map(
    sessions.filter((s) => s.date === today).map((s) => [s.folder_id, s])
  )

  return folders.map((folder) => {
    const cards = byFolder.get(folder.id) || []
    const session = sessionByFolder.get(folder.id)
    const remaining = session
      ? Math.max(0, session.card_ids.length - session.current_index)
      : countDueToday(cards, folder.daily_target, today)

    return {
      folder,
      total: cards.length,
      completed: cards.filter((c) => c.status === 'completed').length,
      today: remaining,
      started: Boolean(session),
      sessionDone: Boolean(session && remaining === 0),
    }
  })
}

export async function listSessions() {
  const db = await getDB()
  return db.getAll('sessions')
}

/**
 * 암기 완료 처리 / 되돌리기.
 * 완료한 카드는 오늘의 묶음에서 빠지고 폴더의 완료 수에 잡힌다.
 * 되돌리면 바로 복습 대상이 되도록 예정일을 오늘로 둔다.
 */
export async function setCardCompleted(id, completed, today = todayStr()) {
  if (completed) return updateCard(id, { status: 'completed' })

  const card = await getCard(id)
  if (!card) return null
  return updateCard(id, {
    status: card.attempt_count > 0 ? 'learning' : 'new',
    review_due_date: card.attempt_count > 0 ? today : null,
  })
}
