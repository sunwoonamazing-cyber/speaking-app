// 테마 설정 — 첫 페인트 전에 읽어야 해서 localStorage에 둔다.
// (IndexedDB는 비동기라 화면이 번쩍인다)
const KEY = 'app.theme'

export function getTheme() {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function setTheme(next) {
  try {
    if (next === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, next)
  } catch {}

  const root = document.documentElement
  if (next === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', next)
}
