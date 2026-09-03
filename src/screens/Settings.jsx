import { useEffect, useRef, useState } from 'react'
import { navigate } from '../router.js'
import { getTheme, setTheme } from '../theme.js'
import { getStorageEstimate, isStoragePersisted, requestPersistentStorage } from '../db.js'
import { ACCENTS, AZURE_REGIONS, maskKey, testAzureCredentials } from '../settings.js'

function Segment({ options, value, onChange }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button
          key={o.value}
          className={`seg__btn ${value === o.value ? 'is-on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Row({ label, value, tone }) {
  return (
    <div className="check-row">
      <span className="check-row__label">{label}</span>
      <span className={`check-row__value check-row__value--${tone || 'plain'}`}>{value}</span>
    </div>
  )
}

function formatBytes(n) {
  if (n === undefined || n === null) return '-'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export default function Settings({ settings, onSave }) {
  const [keyDraft, setKeyDraft] = useState(settings.azure_key)
  const [regionDraft, setRegionDraft] = useState(settings.azure_region)
  const [showKey, setShowKey] = useState(false)
  const [saveState, setSaveState] = useState(null) // 'saving' | 'saved'
  const [test, setTest] = useState(null) // { pending } | { ok, message }

  const [theme, setThemeState] = useState(getTheme)
  const [persist, setPersist] = useState({ supported: true, granted: false, loading: true })
  const [usage, setUsage] = useState(null)

  const [standalone, setStandalone] = useState(false)
  const [swState, setSwState] = useState('확인 중')
  const [online, setOnline] = useState(navigator.onLine)

  const savedTimer = useRef(null)

  useEffect(() => {
    refreshStorage()

    setStandalone(
      window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true
    )

    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)

    let swTimer
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => setSwState(reg?.active ? '등록됨' : '등록 중'))
        .catch(() => {})
      navigator.serviceWorker.ready
        .then(() => setSwState('등록됨'))
        .catch(() => setSwState('확인 실패'))
      swTimer = setTimeout(() => setSwState((s) => (s === '등록됨' ? s : '등록 실패')), 15000)
    } else {
      setSwState('지원 안 함')
    }

    const timers = savedTimer
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      clearTimeout(swTimer)
      clearTimeout(timers.current)
    }
  }, [])

  async function refreshStorage() {
    const p = await isStoragePersisted()
    setPersist({ ...p, loading: false })
    setUsage(await getStorageEstimate())
  }

  const dirty =
    keyDraft.trim() !== settings.azure_key || regionDraft.trim() !== settings.azure_region

  async function handleSave() {
    setSaveState('saving')
    const region = regionDraft.trim().toLowerCase()
    await onSave({ azure_key: keyDraft.trim(), azure_region: region })
    setRegionDraft(region)
    setSaveState('saved')

    // 명세: 저장소 보호는 사용자가 버튼을 누른 직후에 요청한다
    if (!persist.granted) {
      await requestPersistentStorage()
      refreshStorage()
    }

    clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSaveState(null), 2500)
  }

  async function handleTest() {
    setTest({ pending: true })
    setTest(await testAzureCredentials(keyDraft, regionDraft))
  }

  async function handleClearKey() {
    setKeyDraft('')
    setTest(null)
    await onSave({ azure_key: '' })
  }

  async function handlePersist() {
    await requestPersistentStorage()
    refreshStorage()
  }

  function pickTheme(next) {
    setTheme(next)
    setThemeState(next)
  }

  const activeVoice = ACCENTS.find((a) => a.value === settings.accent)

  return (
    <>
      <header className="head">
        <button className="link-btn" onClick={() => navigate('/')}>
          홈으로
        </button>
        <h1 className="serif head__title">설정</h1>
        <hr className="rule-line" />
      </header>

      <section className="card stack">
        <h2 className="section-title">Azure 연결</h2>
        <p className="muted">
          키는 이 기기 안에만 저장되고 밖으로 나가지 않습니다. 기기를 바꾸면 다시 넣어야 합니다.
        </p>

        <div className="field">
          <label className="field__label" htmlFor="azure-key">
            키
          </label>
          <div className="field__row">
            <input
              id="azure-key"
              className="input"
              type={showKey ? 'text' : 'password'}
              value={keyDraft}
              onChange={(e) => { setKeyDraft(e.target.value); setTest(null) }}
              placeholder="Azure Portal에서 복사한 키"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
            />
            <button className="btn btn--tight" onClick={() => setShowKey((v) => !v)}>
              {showKey ? '가리기' : '보기'}
            </button>
          </div>
          {settings.azure_key && !showKey && (
            <span className="muted">저장된 키: {maskKey(settings.azure_key)}</span>
          )}
        </div>

        <div className="field">
          <label className="field__label" htmlFor="azure-region">
            지역
          </label>
          <input
            id="azure-region"
            className="input"
            type="text"
            list="azure-regions"
            value={regionDraft}
            onChange={(e) => { setRegionDraft(e.target.value); setTest(null) }}
            placeholder="예: eastus"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
          />
          <datalist id="azure-regions">
            {AZURE_REGIONS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>

        <div className="btn-row">
          <button
            className="btn btn--primary"
            onClick={handleSave}
            disabled={!dirty || saveState === 'saving'}
          >
            {saveState === 'saving'
              ? '저장하는 중'
              : saveState === 'saved'
                ? '저장했습니다'
                : '저장하기'}
          </button>
          <button
            className="btn"
            onClick={handleTest}
            disabled={Boolean(test?.pending) || !keyDraft.trim() || !regionDraft.trim()}
          >
            {test?.pending ? '확인하는 중' : '연결 확인하기'}
          </button>
        </div>

        {test && !test.pending && (
          <p className={test.ok ? 'notice notice--ok' : 'notice notice--bad'}>{test.message}</p>
        )}

        {settings.azure_key && (
          <button className="link-btn link-btn--danger" onClick={handleClearKey}>
            저장된 키 지우기
          </button>
        )}
      </section>

      <section className="card stack">
        <h2 className="section-title">원어민 발음</h2>
        <Segment
          options={ACCENTS.map((a) => ({ value: a.value, label: a.label }))}
          value={settings.accent}
          onChange={(v) => onSave({ accent: v })}
        />
        <p className="muted">
          정답 문장을 들을 때 쓰는 목소리입니다. 지금 목소리: {activeVoice?.voice}
        </p>
      </section>

      <section className="card stack">
        <h2 className="section-title">화면</h2>
        <Segment
          options={[
            { value: 'light', label: '라이트' },
            { value: 'dark', label: '다크' },
            { value: 'system', label: '시스템' },
          ]}
          value={theme}
          onChange={pickTheme}
        />
      </section>

      <section className="card stack">
        <h2 className="section-title">저장소</h2>
        <Row
          label="영구 보관"
          value={
            persist.loading
              ? '확인 중'
              : !persist.supported
                ? '지원 안 함'
                : persist.granted
                  ? '승인됨'
                  : '아직 아님'
          }
          tone={persist.granted ? 'ok' : 'plain'}
        />
        {usage && <Row label="사용 중" value={formatBytes(usage.usage)} />}
        {!persist.loading && !persist.granted && persist.supported && (
          <>
            <button className="btn btn--full" onClick={handlePersist}>
              저장소 보호 요청하기
            </button>
            <p className="muted">
              승인되지 않으면 저장 공간이 부족할 때 브라우저가 카드를 지울 수 있습니다. 홈화면에
              설치해두면 대체로 승인됩니다.
            </p>
          </>
        )}
      </section>

      <section className="card stack">
        <h2 className="section-title">상태</h2>
        <Row
          label="홈화면 설치"
          value={standalone ? '설치 상태로 실행 중' : '브라우저 탭에서 실행 중'}
          tone={standalone ? 'ok' : 'plain'}
        />
        <Row label="서비스워커" value={swState} tone={swState === '등록됨' ? 'ok' : 'plain'} />
        <Row label="인터넷" value={online ? '연결됨' : '오프라인'} tone={online ? 'ok' : 'warn'} />
        <Row label="배포 경로" value={import.meta.env.BASE_URL} />
      </section>
    </>
  )
}
