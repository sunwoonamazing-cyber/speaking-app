/**
 * 폴더 색 팔레트 — 책등·색인 탭에 쓰는 물 빠진 천 색 여섯 가지.
 * 실제 색값은 tokens.css에 있고 여기서는 키와 이름만 다룬다
 * (라이트/다크에서 값이 달라지므로 CSS 변수로 참조해야 한다).
 */
export const FOLDER_COLORS = [
  { key: 'blue', label: '흐린 청', var: 'var(--folder-blue)' },
  { key: 'violet', label: '남보라', var: 'var(--folder-violet)' },
  { key: 'plum', label: '자두', var: 'var(--folder-plum)' },
  { key: 'ochre', label: '황토', var: 'var(--folder-ochre)' },
  { key: 'moss', label: '이끼', var: 'var(--folder-moss)' },
  { key: 'fog', label: '안개회', var: 'var(--folder-fog)' },
]

export const DEFAULT_COLOR = FOLDER_COLORS[0].key

export function colorVar(key) {
  const found = FOLDER_COLORS.find((c) => c.key === key)
  return (found || FOLDER_COLORS[0]).var
}

/** 폴더를 만들 때 아직 안 쓴 색을 먼저 배정하고, 다 쓰면 가장 적게 쓴 색을 준다. */
export function pickUnusedColor(folders) {
  const used = new Map(FOLDER_COLORS.map((c) => [c.key, 0]))
  for (const f of folders) {
    if (used.has(f.color)) used.set(f.color, used.get(f.color) + 1)
  }
  let best = FOLDER_COLORS[0].key
  let bestCount = Infinity
  for (const c of FOLDER_COLORS) {
    const n = used.get(c.key)
    if (n < bestCount) {
      bestCount = n
      best = c.key
    }
  }
  return best
}
