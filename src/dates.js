/**
 * 날짜는 모두 기기 로컬 시간 기준의 'YYYY-MM-DD' 문자열로 다룬다.
 * - 문자열끼리 비교하면 그대로 날짜 순서가 되므로 조회가 단순해진다
 * - UTC로 저장하면 한국 시간 자정 근처에서 '오늘'이 어긋난다
 */
export function todayStr(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  return todayStr(dt)
}

/** a - b (일수). 둘 다 'YYYY-MM-DD' */
export function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  const da = new Date(ay, am - 1, ad)
  const dbb = new Date(by, bm - 1, bd)
  return Math.round((da - dbb) / 86400000)
}
