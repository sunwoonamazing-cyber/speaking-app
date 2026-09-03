import { getDB } from './db.js'
import { todayStr } from './dates.js'
import { DEFAULT_DAILY_TARGET } from './data.js'

export const BACKUP_FORMAT = 'speaking-app-backup'
export const BACKUP_VERSION = 1

/**
 * 내보내기.
 * 폴더 구조와 폴더별 설정까지 함께 담는다 — 카드만 옮기면 폴더가 사라진다.
 *
 * Azure 키는 일부러 넣지 않는다. 백업 파일은 메일이나 클라우드로 옮기기 쉬워서
 * 키가 함께 새어 나갈 수 있다. 새 기기에서는 설정 화면에서 다시 넣으면 된다.
 * 학습 세션도 넣지 않는다 — 그날치 진행 상황이라 다른 기기로 옮길 이유가 없다.
 */
export async function exportData() {
  const db = await getDB()
  const [folders, cards, settingsRows] = await Promise.all([
    db.getAll('folders'),
    db.getAll('cards'),
    db.getAll('settings'),
  ])

  const settings = {}
  for (const row of settingsRows) {
    if (row.key === 'accent') settings.accent = row.value
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    settings,
    folders: folders.sort((a, b) => a.sort_order - b.sort_order),
    cards,
  }
}

export function backupFileName(today = todayStr()) {
  return `영어문장모음집-백업-${today}.json`
}

/** 파일로 내려받기 */
export function downloadBackup(data, fileName = backupFileName()) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 브라우저가 내려받기를 시작할 틈을 주고 정리한다
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

/* ------------------------------------------------------------------ */
/* 가져오기                                                             */
/* ------------------------------------------------------------------ */

export class BackupError extends Error {}

/** 파일 내용을 훑어보고 문제가 있으면 알려 준다 (아직 저장하지 않는다) */
export function inspectBackup(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new BackupError('JSON 파일이 아닙니다. 내보내기로 만든 파일인지 확인해 주세요.')
  }

  if (!data || data.format !== BACKUP_FORMAT) {
    throw new BackupError('이 앱에서 내보낸 백업 파일이 아닙니다.')
  }
  if (!Array.isArray(data.folders) || !Array.isArray(data.cards)) {
    throw new BackupError('파일이 손상된 것 같습니다. 폴더나 카드 목록이 없습니다.')
  }
  if (Number(data.version) > BACKUP_VERSION) {
    throw new BackupError('더 새로운 버전에서 만든 파일입니다. 앱을 먼저 새로고침해 주세요.')
  }

  const folders = data.folders.filter((f) => f && typeof f.id === 'string' && f.name)
  const folderIds = new Set(folders.map((f) => f.id))
  const cards = data.cards.filter(
    (c) => c && typeof c.id === 'string' && c.folder_id && c.korean_text && c.english_text
  )
  const orphans = cards.filter((c) => !folderIds.has(c.folder_id)).length

  return {
    data,
    folders,
    cards,
    summary: {
      folders: folders.length,
      cards: cards.length,
      dropped: data.folders.length - folders.length + (data.cards.length - cards.length),
      orphans,
      exported_at: data.exported_at || null,
    },
  }
}

/** 빠진 항목을 채워 지금 쓰는 카드 모양으로 맞춘다 (예전 백업도 열리도록) */
function normalizeCard(card) {
  // 색이 없던 시절 백업은 flagged만 있다 — 빨강으로 옮긴다
  const flag = card.flag ?? (card.flagged ? 'red' : null)
  return {
    flagged: false,
    status: 'new',
    review_due_date: null,
    interval: 0,
    repetitions: 0,
    ease_factor: 2.5,
    last_scores: null,
    last_avg_score: null,
    last_mode: null,
    attempt_count: 0,
    fail_count: 0,
    created_at: new Date().toISOString(),
    ...card,
    flag,
    flagged: Boolean(flag),
  }
}

function normalizeFolder(folder, index) {
  return {
    color: 'blue',
    daily_target: DEFAULT_DAILY_TARGET,
    default_mode: 'speak',
    sort_order: index,
    created_at: new Date().toISOString(),
    ...folder,
  }
}

/**
 * 가져오기 적용.
 * mode: 'merge'   없는 것만 더한다 (이미 있는 폴더·카드는 건드리지 않음)
 *       'replace' 지금 폴더와 카드를 모두 지우고 파일 내용으로 바꾼다
 */
export async function applyBackup(inspected, mode) {
  const { folders, cards, data } = inspected
  const db = await getDB()

  const existingFolders = await db.getAll('folders')
  const existingCards = await db.getAll('cards')
  const haveFolder = new Set(existingFolders.map((f) => f.id))
  const haveCard = new Set(existingCards.map((c) => c.id))

  const report = { foldersAdded: 0, cardsAdded: 0, skipped: 0, removed: 0 }

  if (mode === 'replace') {
    const tx = db.transaction(['folders', 'cards', 'sessions'], 'readwrite')
    report.removed = existingFolders.length + existingCards.length
    await Promise.all([
      tx.objectStore('folders').clear(),
      tx.objectStore('cards').clear(),
      // 세션은 지금 폴더를 가리키므로 함께 비운다
      tx.objectStore('sessions').clear(),
    ])
    await tx.done
    haveFolder.clear()
    haveCard.clear()
  }

  const keepFolders = folders.filter((f) => mode === 'replace' || !haveFolder.has(f.id))
  const folderIds = new Set([...haveFolder, ...folders.map((f) => f.id)])

  const keepCards = cards.filter((c) => {
    if (mode !== 'replace' && haveCard.has(c.id)) return false
    // 갈 폴더가 없는 카드는 넣지 않는다 (폴더 없는 카드가 생기면 안 된다)
    return folderIds.has(c.folder_id)
  })
  report.skipped = folders.length - keepFolders.length + (cards.length - keepCards.length)

  const tx = db.transaction(['folders', 'cards'], 'readwrite')
  const folderStore = tx.objectStore('folders')
  const cardStore = tx.objectStore('cards')
  await Promise.all([
    ...keepFolders.map((f, i) => folderStore.put(normalizeFolder(f, i))),
    ...keepCards.map((c) => cardStore.put(normalizeCard(c))),
  ])
  await tx.done

  report.foldersAdded = keepFolders.length
  report.cardsAdded = keepCards.length

  // 억양 설정도 함께 옮긴다 (키는 담지 않으므로 기기마다 다시 넣어야 한다)
  if (data.settings?.accent) {
    await db.put('settings', { key: 'accent', value: data.settings.accent })
  }

  return report
}
