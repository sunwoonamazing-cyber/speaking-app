import { useCallback, useEffect, useState } from 'react'
import UpdatePrompt from './components/UpdatePrompt.jsx'
import Home from './screens/Home.jsx'
import Settings from './screens/Settings.jsx'
import { useRoute } from './router.js'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings.js'
import './styles/app.css'

export default function App() {
  const route = useRoute()
  const [settings, setSettings] = useState(null)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    loadSettings()
      .then(setSettings)
      .catch((err) => {
        // 사생활 보호 모드 등에서 IndexedDB를 못 여는 경우
        setLoadError(err)
        setSettings({ ...DEFAULT_SETTINGS })
      })
  }, [])

  const handleSave = useCallback(async (patch) => {
    setSettings((prev) => ({ ...prev, ...patch }))
    try {
      await saveSettings(patch)
    } catch (err) {
      setLoadError(err)
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
      {loadError && (
        <p className="notice notice--bad">
          기기 저장소를 열지 못했습니다. 시크릿 모드에서는 설정이 저장되지 않습니다.
        </p>
      )}

      {route === '/settings' ? (
        <Settings settings={settings} onSave={handleSave} />
      ) : (
        <Home />
      )}

      <UpdatePrompt />
    </div>
  )
}
