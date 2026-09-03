import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

/**
 * 새 버전을 배포해도 설치된 PWA가 예전 화면을 계속 보여주는 문제 대응.
 * 새 서비스워커가 대기 중이면 안내 배너를 띄우고, 누르면 즉시 교체 후 새로고침한다.
 */
export default function UpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)
  const [update, setUpdate] = useState(null)

  useEffect(() => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        setNeedRefresh(true)
      },
      onOfflineReady() {
        setOfflineReady(true)
        setTimeout(() => setOfflineReady(false), 4000)
      },
    })
    setUpdate(() => updateSW)
  }, [])

  if (!needRefresh && !offlineReady) return null

  return (
    <div className="update-bar" role="status">
      {needRefresh ? (
        <>
          <span>새 버전이 있습니다.</span>
          <button className="btn btn--primary update-bar__btn" onClick={() => update && update(true)}>
            새로고침
          </button>
        </>
      ) : (
        <span>이제 인터넷 없이도 열립니다.</span>
      )}
    </div>
  )
}
