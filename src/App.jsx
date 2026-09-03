import { useCallback, useEffect, useState } from 'react'
import UpdatePrompt from './components/UpdatePrompt.jsx'
import CardEdit from './screens/CardEdit.jsx'
import FolderDetail from './screens/FolderDetail.jsx'
import FolderEdit from './screens/FolderEdit.jsx'
import FolderList from './screens/FolderList.jsx'
import Settings from './screens/Settings.jsx'
import { useRoute } from './router.js'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings.js'
import './styles/app.css'

/**
 * 화면 고르기.
 * 해시 경로를 조각으로 잘라 맞춘다 — 화면 수가 적어 라우터 라이브러리는 쓰지 않는다.
 */
function pickScreen(route, settings, onSaveSettings) {
  const seg = route.split('/').filter(Boolean)

  if (seg.length === 0) return <FolderList />
  if (seg[0] === 'settings') return <Settings settings={settings} onSave={onSaveSettings} />

  if (seg[0] === 'folders') {
    if (seg[1] === 'new') return <FolderEdit folderId={null} />
    if (seg[1] && seg[2] === 'edit') return <FolderEdit folderId={seg[1]} />
    if (seg[1] && seg[2] === 'cards' && seg[3] === 'new') return <CardEdit folderId={seg[1]} />
    if (seg[1]) return <FolderDetail folderId={seg[1]} />
  }

  if (seg[0] === 'cards' && seg[1] && seg[2] === 'edit') return <CardEdit cardId={seg[1]} />

  return <FolderList />
}

export default function App() {
  const route = useRoute()
  const [settings, setSettings] = useState(null)
  const [storeError, setStoreError] = useState(null)

  useEffect(() => {
    loadSettings()
      .then(setSettings)
      .catch((err) => {
        // 사생활 보호 모드 등에서 IndexedDB를 못 여는 경우
        setStoreError(err)
        setSettings({ ...DEFAULT_SETTINGS })
      })
  }, [])

  const handleSaveSettings = useCallback(async (patch) => {
    setSettings((prev) => ({ ...prev, ...patch }))
    try {
      await saveSettings(patch)
    } catch (err) {
      setStoreError(err)
    }
  }, [])

  if (!settings) {
    return (
      <div className="app">
        <p className="muted">불러오는 중…</p>
      </div>
    )
  }

  return (
    <div className="app">
      {storeError && (
        <p className="notice notice--bad">
          기기 저장소를 열지 못했습니다. 시크릿 모드에서는 아무것도 저장되지 않습니다.
        </p>
      )}

      {/* key를 주어 경로가 바뀌면 화면을 새로 그린다 — 예전 폴더의 카드가 남는 것을 막는다 */}
      <div key={route}>{pickScreen(route, settings, handleSaveSettings)}</div>

      <UpdatePrompt />
    </div>
  )
}
