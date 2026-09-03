import { useEffect, useState } from 'react'
import UpdatePrompt from './components/UpdatePrompt.jsx'
import { getTheme, setTheme } from './theme.js'
import './styles/app.css'

const FOLDER_COLORS = [
  ['흐린 청', 'var(--folder-blue)'],
  ['남보라', 'var(--folder-violet)'],
  ['자두', 'var(--folder-plum)'],
  ['황토', 'var(--folder-ochre)'],
  ['이끼', 'var(--folder-moss)'],
  ['안개회', 'var(--folder-fog)'],
]

function Row({ label, value, tone }) {
  return (
    <div className="check-row">
      <span className="check-row__label">{label}</span>
      <span className={`check-row__value check-row__value--${tone || 'plain'}`}>{value}</span>
    </div>
  )
}

export default function App() {
  const [theme, setThemeState] = useState(getTheme)
  const [online, setOnline] = useState(navigator.onLine)
  const [standalone, setStandalone] = useState(false)
  const [swState, setSwState] = useState('확인 중')
  const [persisted, setPersisted] = useState('확인 중')
  const [viewport, setViewport] = useState('')

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    setStandalone(isStandalone)

    const measure = () => setViewport(`${window.innerWidth} × ${window.innerHeight}`)
    measure()
    window.addEventListener('resize', measure)

    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)

    // 첫 방문에서는 등록이 아직 끝나지 않았을 수 있다.
    // getRegistration()으로 즉시 한 번 보고, ready로 활성화까지 기다린다.
    let swTimer
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => setSwState(reg?.active ? '등록됨' : '등록 중'))
        .catch(() => {})
      navigator.serviceWorker.ready
        .then(() => setSwState('등록됨'))
        .catch(() => setSwState('확인 실패'))
      // 끝내 활성화되지 않으면 계속 '등록 중'으로 남지 않게 한다
      swTimer = setTimeout(() => setSwState((s) => (s === '등록됨' ? s : '등록 실패')), 15000)
    } else {
      setSwState('지원 안 함')
    }

    refreshPersisted()

    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      clearTimeout(swTimer)
    }
  }, [])

  function refreshPersisted() {
    if (navigator.storage?.persisted) {
      navigator.storage
        .persisted()
        .then((v) => setPersisted(v ? '승인됨' : '아직 아님'))
        .catch(() => setPersisted('확인 실패'))
    } else {
      setPersisted('지원 안 함')
    }
  }

  // 명세: 페이지 로딩 시점이 아니라 사용자가 버튼을 누른 직후에 요청한다.
  async function requestPersist() {
    if (!navigator.storage?.persist) return
    try {
      const granted = await navigator.storage.persist()
      setPersisted(granted ? '승인됨' : '거부됨 — 홈화면에 설치 후 다시 시도')
    } catch {
      setPersisted('요청 실패')
    }
  }

  function pickTheme(next) {
    setTheme(next)
    setThemeState(next)
  }

  return (
    <div className="app">
      <header className="head">
        <h1 className="serif head__title">입트영 복습</h1>
        <hr className="rule-line" />
        <p className="muted">1단계 — 기본 골격 · PWA 설치 · 색과 서체 확인</p>
      </header>

      <section className="card stack">
        <h2 className="section-title">환경 점검</h2>
        <Row
          label="홈화면 설치(standalone)"
          value={standalone ? '설치 상태로 실행 중' : '브라우저 탭에서 실행 중'}
          tone={standalone ? 'ok' : 'plain'}
        />
        <Row label="서비스워커" value={swState} tone={swState === '등록됨' ? 'ok' : 'plain'} />
        <Row label="인터넷" value={online ? '연결됨' : '오프라인'} tone={online ? 'ok' : 'warn'} />
        <Row label="화면 크기" value={viewport} />
        <Row label="배포 경로" value={import.meta.env.BASE_URL} />

        <hr className="rule-line" />

        <Row
          label="저장소 영구 보관"
          value={persisted}
          tone={persisted === '승인됨' ? 'ok' : 'plain'}
        />
        <button className="btn btn--full" onClick={requestPersist}>
          저장소 보호 요청하기
        </button>
        <p className="muted">
          안드로이드 Chrome은 홈화면에 설치해두면 대체로 승인해 줍니다.
        </p>
      </section>

      <section className="card stack">
        <h2 className="section-title">테마</h2>
        <div className="seg">
          {[
            ['light', '라이트'],
            ['dark', '다크'],
            ['system', '시스템'],
          ].map(([value, label]) => (
            <button
              key={value}
              className={`seg__btn ${theme === value ? 'is-on' : ''}`}
              onClick={() => pickTheme(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="card stack">
        <h2 className="section-title">서체 확인</h2>
        <p className="serif sample-serif">오늘 아침에 지하철이 연착돼서 늦었어요.</p>
        <hr className="rule-line" />
        <p className="sample-sans">The subway was delayed this morning, so I was late.</p>
        <p className="muted">
          위쪽이 세리프(Noto Serif KR), 아래쪽이 산세리프(Pretendard)로 보이면 정상입니다.
        </p>
      </section>

      <section className="card stack">
        <h2 className="section-title">색 확인</h2>
        <div className="swatches">
          {[
            ['paper', 'var(--paper)'],
            ['surface', 'var(--surface)'],
            ['rule', 'var(--rule)'],
            ['ink', 'var(--ink)'],
            ['accent', 'var(--accent)'],
            ['flag', 'var(--flag)'],
          ].map(([name, color]) => (
            <div key={name} className="swatch">
              <span className="swatch__chip" style={{ background: color }} />
              <span className="muted">{name}</span>
            </div>
          ))}
        </div>

        <hr className="rule-line" />

        <p className="muted">폴더 색 팔레트 — 색인 탭 형태로만 사용합니다.</p>
        <ul className="folder-demo">
          {FOLDER_COLORS.map(([name, color]) => (
            <li key={name} className="folder-demo__item">
              <span className="folder-demo__tab" style={{ background: color }} />
              <span className="folder-demo__dot" style={{ background: color }} />
              <span>{name}</span>
            </li>
          ))}
        </ul>
      </section>

      <UpdatePrompt />
    </div>
  )
}
