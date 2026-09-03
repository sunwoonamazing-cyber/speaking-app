/**
 * 색깔 플래그.
 *
 * 폴더 색과 헷갈리지 않게 두 가지를 지킨다.
 *  - 채도: 폴더 색은 물 빠진 천 색, 플래그는 그보다 또렷하다
 *  - 자리: 폴더 색은 왼쪽 세로선과 색인 탭, 플래그는 카드 안의 표식
 * 실제 색값은 tokens.css에 있다 (라이트/다크에서 값이 달라진다).
 */
export const FLAGS = [
  { key: 'red', label: '빨강', var: 'var(--flag-red)' },
  { key: 'yellow', label: '노랑', var: 'var(--flag-yellow)' },
  { key: 'green', label: '초록', var: 'var(--flag-green)' },
  { key: 'blue', label: '파랑', var: 'var(--flag-blue)' },
  { key: 'purple', label: '보라', var: 'var(--flag-purple)' },
]

export const FLAG_KEYS = FLAGS.map((f) => f.key)

/**
 * 카드의 플래그 색.
 * 색이 없던 시절에 표시한 카드(flagged: true)는 빨강으로 본다.
 */
export function cardFlag(card) {
  if (!card) return null
  if (card.flag && FLAG_KEYS.includes(card.flag)) return card.flag
  return card.flagged ? 'red' : null
}

export function flagVar(key) {
  const found = FLAGS.find((f) => f.key === key)
  return found ? found.var : 'var(--rule)'
}

export function flagLabel(key) {
  return FLAGS.find((f) => f.key === key)?.label || ''
}

/**
 * 카드에 넣을 변경분.
 * flagged(참/거짓)도 함께 써 둔다 — 우선순위 점수와 예전 백업이 이 값을 본다.
 */
export function flagPatch(key) {
  return { flag: key || null, flagged: Boolean(key) }
}
