import { useEffect, useState } from 'react'

/**
 * 해시 기반 라우팅.
 * - GitHub Pages 하위 경로에서 새로고침해도 404가 나지 않는다
 * - 안드로이드 기기의 뒤로가기 버튼이 화면 이동으로 동작한다
 *   (화면을 상태값으로만 바꾸면 뒤로가기가 앱을 그냥 닫아버림)
 */
export function currentRoute() {
  return window.location.hash.replace(/^#/, '') || '/'
}

export function navigate(to) {
  if (currentRoute() === to) return
  window.location.hash = to
}

export function goBack() {
  if (window.history.length > 1) window.history.back()
  else navigate('/')
}

export function useRoute() {
  const [route, setRoute] = useState(currentRoute)
  useEffect(() => {
    const onChange = () => setRoute(currentRoute())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
