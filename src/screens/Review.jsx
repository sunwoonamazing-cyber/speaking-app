import { useCallback, useEffect, useRef, useState } from 'react'
import { navigate } from '../router.js'
import ListenButton from '../components/ListenButton.jsx'
import {
  extendSession,
  getFolder,
  loadSessionCards,
  setCardCompleted,
  startOrResumeSession,
  updateCard,
  updateSession,
} from '../data.js'
import { MicRecorder } from '../audio/recorder.js'
import { createPushStream, overallScore, startAssessment } from '../speech/assess.js'
import { scoreTyping } from '../speech/typing.js'
import {
  MANUAL_AGAIN,
  applySm2,
  describeDue,
  gradeLabel,
  isPass,
  scoreToGrade,
} from '../sm2.js'
import { todayStr } from '../dates.js'

const MAX_RECORD_SECONDS = 30
// 응답이 끝내 안 오면 '채점하는 중'에 갇히지 않도록 여기서 끊는다
const ASSESS_TIMEOUT_MS = 20000

export default function Review({ folderId, settings }) {
  const [session, setSession] = useState(null)
  const [cards, setCards] = useState(null)
  const [folderName, setFolderName] = useState('')
  const [index, setIndex] = useState(0)
  const [mode, setMode] = useState('speak')
  const [loadError, setLoadError] = useState(null)
  const [noMore, setNoMore] = useState(false)
  const [extending, setExtending] = useState(false)

  const [phase, setPhase] = useState('ready') // ready | preparing | recording | assessing | result
  const [level, setLevel] = useState(0)
  const [result, setResult] = useState(null)
  const [typed, setTyped] = useState('')
  const [typeResult, setTypeResult] = useState(null)
  const [problem, setProblem] = useState(null)
  const [reveal, setReveal] = useState(false)
  const [audioUrl, setAudioUrl] = useState(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [outcome, setOutcome] = useState(null) // { grade, due, manual }

  const recorderRef = useRef(null)
  const pushStreamRef = useRef(null)
  const assessRef = useRef(null)
  const autoStopRef = useRef(null)
  // 등급을 매기기 직전의 카드 상태. 수동으로 등급을 덮어쓸 때 여기서 다시 계산한다
  // (그래야 자동 채점분이 두 번 반영되지 않는다)
  const beforeRef = useRef(null)

  const card = cards?.[index] || null

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const f = await getFolder(folderId)
        if (!alive) return
        if (!f) {
          navigate('/')
          return
        }
        setFolderName(f.name)
        setMode(f.default_mode || 'speak')

        const s = await startOrResumeSession(folderId)
        if (!alive) return
        let list = await loadSessionCards(s.card_ids)
        if (!alive) return

        // 세션을 만든 뒤 지워진 카드가 있으면 목록에서 조용히 빼 준다
        if (list.length !== s.card_ids.length) {
          const ids = list.map((c) => c.id)
          await updateSession(s.id, { card_ids: ids })
          s.card_ids = ids
        }

        setSession(s)
        setCards(list)
        setIndex(Math.min(s.current_index, list.length))
      } catch (err) {
        if (alive) setLoadError(err?.message || '오늘의 학습을 불러오지 못했습니다.')
      }
    })()

    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      alive = false
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [folderId])

  useEffect(() => {
    return () => {
      recorderRef.current?.stop()
      try {
        pushStreamRef.current?.close()
      } catch {
        // 이미 닫혔으면 무시
      }
      clearTimeout(autoStopRef.current)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])

  const resetCardState = useCallback(() => {
    setPhase('ready')
    setResult(null)
    setTypeResult(null)
    setTyped('')
    setProblem(null)
    setReveal(false)
    setLevel(0)
    setOutcome(null)
    beforeRef.current = null
    setAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }, [])

  const hasKey = Boolean(settings.azure_key && settings.azure_region)

  /**
   * 등급을 카드에 반영한다. 복습 횟수·실패 횟수·최근 점수와 함께
   * SM-2 일정(간격·연속 통과·난이도·다음 복습일)까지 갱신한다.
   */
  async function applyGrade({ grade, score, usedMode, scores, manual = false }) {
    if (!card || !Number.isFinite(grade)) return

    // 자동 채점이면 지금 상태를 기준점으로 잡아 두고,
    // 수동 덮어쓰기면 그 기준점에서 다시 계산한다
    if (!manual) beforeRef.current = { ...card }
    const base = beforeRef.current || card
    const today = todayStr()

    const schedule = applySm2(base, grade, today)
    const patch = {
      ...schedule,
      attempt_count: (base.attempt_count || 0) + 1,
      fail_count: (base.fail_count || 0) + (isPass(grade) ? 0 : 1),
      last_scores: scores ?? base.last_scores ?? null,
      last_avg_score: Number.isFinite(score) ? score : (base.last_avg_score ?? null),
      last_mode: usedMode || base.last_mode || null,
    }

    await updateCard(card.id, patch)
    setCards((prev) => {
      if (!prev) return prev
      const copy = [...prev]
      copy[index] = { ...base, ...patch }
      return copy
    })
    setOutcome({ grade, due: schedule.review_due_date, manual })
  }

  async function startRecording() {
    if (!hasKey) {
      setProblem({ kind: 'nokey', message: 'Azure 키가 아직 없습니다.' })
      return
    }
    if (!online) {
      setProblem({ kind: 'offline', message: '인터넷에 연결되어 있지 않습니다.' })
      return
    }

    setProblem(null)
    setResult(null)
    setOutcome(null)
    setAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })

    setPhase('preparing')

    let pushStream
    try {
      pushStream = await createPushStream()
    } catch {
      setPhase('ready')
      setProblem({
        kind: 'network',
        message: '채점 기능을 내려받지 못했습니다. 인터넷을 확인해 주세요.',
      })
      return
    }
    pushStreamRef.current = pushStream

    const recorder = new MicRecorder({
      onChunk: (pcm) => {
        // Azure에 넘길 때는 복사본을 준다 (원본은 다시 듣기용으로 남겨 둔다)
        try {
          pushStream.write(pcm.slice().buffer)
        } catch {
          // 스트림이 이미 닫혔으면 무시
        }
      },
      onLevel: (rms) => setLevel(rms),
    })
    recorderRef.current = recorder

    try {
      await recorder.start()
    } catch (err) {
      pushStreamRef.current = null
      setPhase('ready')
      setProblem({ kind: err.kind === 'denied' ? 'denied' : 'mic', message: err.message })
      return
    }

    setPhase('recording')

    try {
      assessRef.current = await startAssessment({
        key: settings.azure_key,
        region: settings.azure_region,
        language: settings.accent || 'en-US',
        referenceText: card.english_text,
        pushStream,
      })
    } catch (err) {
      await recorder.stop()
      recorderRef.current = null
      pushStreamRef.current = null
      setPhase('ready')
      setProblem({
        kind: 'network',
        message: '채점을 시작하지 못했습니다. ' + (err?.message || ''),
      })
      return
    }

    // 실수로 계속 켜 두는 일이 없도록 최대 길이에서 자동으로 멈춘다
    autoStopRef.current = setTimeout(() => stopRecording(), MAX_RECORD_SECONDS * 1000)
  }

  async function stopRecording() {
    clearTimeout(autoStopRef.current)
    const recorder = recorderRef.current
    const assessment = assessRef.current
    if (!recorder || !assessment) return

    setPhase('assessing')
    setLevel(0)

    await recorder.stop()
    const silent = recorder.isSilent()
    const seconds = recorder.seconds
    setAudioUrl(URL.createObjectURL(recorder.toWavBlob()))

    try {
      pushStreamRef.current?.close()
    } catch {
      // 이미 닫혔으면 무시
    }

    let assessed = await Promise.race([
      assessment.promise,
      new Promise((resolve) =>
        setTimeout(
          () => resolve({ ok: false, reason: 'network', message: '채점 응답이 오지 않았습니다.' }),
          ASSESS_TIMEOUT_MS
        )
      ),
    ])
    recorderRef.current = null
    assessRef.current = null
    pushStreamRef.current = null

    // 소리가 거의 안 들어왔으면 Azure가 뭐라고 하든 채점으로 세지 않는다.
    // (주변 소음을 문장으로 '인식됨' 처리해 0점을 돌려주는 경우가 있다)
    if (silent) assessed = { ok: false, reason: 'nomatch' }

    if (!assessed.ok) {
      if (assessed.reason === 'nomatch') {
        // 명세: 인식 실패는 0점 오답으로 기록하지 않는다. 카드 일정은 그대로 둔다.
        setProblem({
          kind: 'nomatch',
          message: silent
            ? '소리가 거의 들어오지 않았습니다. 마이크가 막혀 있는지 확인하고 다시 녹음해 주세요.'
            : seconds < 0.7
              ? '녹음이 너무 짧습니다. 문장을 끝까지 말한 뒤 멈춰 주세요.'
              : '잘 들리지 않았어요. 다시 녹음해 주세요.',
        })
      } else {
        setProblem({ kind: assessed.reason, message: assessed.message })
      }
      setPhase('ready')
      return
    }

    setResult(assessed)
    setPhase('result')
    const score = assessed.overall ?? overallScore(assessed.scores)
    await applyGrade({
      grade: scoreToGrade(score),
      score,
      usedMode: 'speak',
      scores: assessed.scores,
    })
  }

  async function gradeTyping() {
    if (!card) return
    const typedResult = scoreTyping(typed, card.english_text)
    setTypeResult(typedResult)
    setPhase('result')
    await applyGrade({
      grade: scoreToGrade(typedResult.score),
      score: typedResult.score,
      usedMode: 'type',
      scores: null,
    })
  }

  /** 암기 완료 표시 / 되돌리기. 실수로 눌러도 바로 되돌릴 수 있게 해 둔다. */
  async function setCompleted(done) {
    if (!card) return
    const updated = await setCardCompleted(card.id, done)
    if (!updated) return
    setCards((prev) => {
      if (!prev) return prev
      const copy = [...prev]
      copy[index] = updated
      return copy
    })
  }

  async function goNext() {
    resetCardState()
    const nextIndex = index + 1
    setIndex(nextIndex)
    if (session) {
      const updated = await updateSession(session.id, {
        current_index: nextIndex,
        completed: nextIndex >= cards.length,
      })
      if (updated) setSession(updated)
    }
  }

  async function handleExtend() {
    if (!session) return
    setExtending(true)
    try {
      const { session: next, added } = await extendSession(session)
      if (added > 0) {
        const list = await loadSessionCards(next.card_ids)
        setSession(next)
        setCards(list)
        resetCardState()
      } else {
        setNoMore(true)
      }
    } finally {
      setExtending(false)
    }
  }

  function switchMode(next) {
    if (phase === 'preparing' || phase === 'recording' || phase === 'assessing') return
    setMode(next)
    setProblem(null)
  }

  /* ---------------- 화면 ---------------- */

  if (loadError) {
    return (
      <>
        <p className="notice notice--bad">{loadError}</p>
        <button className="btn btn--full" onClick={() => navigate(`/folders/${folderId}`)}>
          폴더로 돌아가기
        </button>
      </>
    )
  }

  if (!session || cards === null) return <p className="muted">불러오는 중…</p>

  if (cards.length === 0) {
    return (
      <>
        <ReviewHeader folderId={folderId} name={folderName} />
        <section className="card stack">
          <h2 className="serif done-title">오늘 볼 카드가 없습니다</h2>
          <hr className="rule-line" />
          <p className="muted">
            복습일이 아직 안 된 카드는 억지로 끌어오지 않습니다. 그래야 간격 반복이 제 몫을 합니다.
            내일 다시 오시면 됩니다.
          </p>
          <button className="btn btn--full" onClick={() => navigate(`/folders/${folderId}`)}>
            폴더로 돌아가기
          </button>
        </section>
      </>
    )
  }

  if (index >= cards.length) {
    return (
      <>
        <ReviewHeader folderId={folderId} name={folderName} />
        <section className="card stack">
          <h2 className="serif done-title">오늘 몫을 끝냈습니다</h2>
          <hr className="rule-line" />
          <p className="muted">카드 {cards.length}장을 봤습니다.</p>

          {noMore ? (
            <p className="muted">지금 더 볼 수 있는 카드가 없습니다.</p>
          ) : (
            <button className="btn btn--full" onClick={handleExtend} disabled={extending}>
              {extending ? '가져오는 중' : '더 하기'}
            </button>
          )}

          <button
            className="btn btn--primary btn--full"
            onClick={() => navigate(`/folders/${folderId}`)}
          >
            폴더로 돌아가기
          </button>
        </section>
      </>
    )
  }

  const busy = phase === 'preparing' || phase === 'recording' || phase === 'assessing'

  return (
    <>
      <ReviewHeader
        folderId={folderId}
        name={folderName}
        progress={`${index + 1} / ${cards.length}`}
      />

      <div className="seg seg--tight">
        <button
          className={`seg__btn ${mode === 'speak' ? 'is-on' : ''}`}
          onClick={() => switchMode('speak')}
          disabled={busy}
        >
          말하기
        </button>
        <button
          className={`seg__btn ${mode === 'type' ? 'is-on' : ''}`}
          onClick={() => switchMode('type')}
          disabled={busy}
        >
          타이핑
        </button>
      </div>

      <section className="card stack prompt-card">
        <span className="badge-count">
          {card.attempt_count > 0 ? `복습 ${card.attempt_count}회` : '새 카드'}
        </span>
        <p className="serif prompt-ko">{card.korean_text}</p>
        <hr className="rule-line" />

        {reveal ? (
          <p className="prompt-answer">{card.english_text}</p>
        ) : (
          <button className="link-btn" onClick={() => setReveal(true)}>
            정답 보기
          </button>
        )}

        {/* 타이핑 모드에서도 그대로 쓸 수 있고, 한 번 들은 문장은 인터넷 없이도 재생된다 */}
        <ListenButton text={card.english_text} settings={settings} full />
      </section>

      {!online && mode === 'speak' && (
        <p className="notice notice--bad">
          인터넷이 없어 말하기 채점을 할 수 없습니다. 타이핑으로 바꾸면 채점까지 그대로 됩니다.
          <button className="link-btn" onClick={() => switchMode('type')}>
            타이핑으로 바꾸기
          </button>
        </p>
      )}

      {!hasKey && mode === 'speak' && (
        <p className="notice notice--bad">
          Azure 키가 아직 없습니다. 설정에서 키와 지역을 넣어야 말하기 채점이 됩니다.
          <button className="link-btn" onClick={() => navigate('/settings')}>
            설정 열기
          </button>
        </p>
      )}

      {mode === 'speak' ? (
        <SpeakPanel
          phase={phase}
          level={level}
          problem={problem}
          result={result}
          audioUrl={audioUrl}
          canRecord={hasKey && online}
          onStart={startRecording}
          onStop={stopRecording}
          onSwitchToTyping={() => switchMode('type')}
        />
      ) : (
        <TypePanel
          phase={phase}
          typed={typed}
          setTyped={setTyped}
          result={typeResult}
          reference={card.english_text}
          onGrade={gradeTyping}
        />
      )}

      {phase === 'result' && outcome && (
        <section className="card stack">
          <div className="check-row">
            <span className="check-row__label">다음 복습</span>
            <span className="check-row__value check-row__value--ok">
              {describeDue(outcome.due)}
            </span>
          </div>

          <hr className="rule-line" />

          {card.status === 'completed' ? (
            <>
              <p className="notice notice--ok">
                이 카드는 앞으로 오늘의 학습에 나오지 않습니다.
              </p>
              <button className="btn btn--full" onClick={() => setCompleted(false)}>
                되돌리기
              </button>
            </>
          ) : (
            <>
              <p className="muted">채점이 실제 느낌과 다르면 직접 정할 수 있습니다.</p>
              <div className="btn-row">
                <button
                  className={`btn ${outcome.manual && !isPass(outcome.grade) ? 'is-chosen' : ''}`}
                  onClick={() => applyGrade({ grade: MANUAL_AGAIN, manual: true })}
                >
                  다시 볼래요
                </button>
                <button className="btn" onClick={() => setCompleted(true)}>
                  암기 완료
                </button>
              </div>
              <p className="muted">
                암기 완료로 표시하면 이 카드는 오늘의 학습에서 빠집니다.
              </p>
            </>
          )}
        </section>
      )}

      {phase === 'result' && (
        <button className="btn btn--primary btn--full btn-row--spaced" onClick={goNext}>
          {index + 1 < cards.length ? '다음 카드' : '끝내기'}
        </button>
      )}
    </>
  )
}

function ReviewHeader({ folderId, name, progress }) {
  return (
    <header className="head">
      <div className="head--row">
        <button className="link-btn" onClick={() => navigate(`/folders/${folderId}`)}>
          그만하기
        </button>
        {progress && <span className="progress">{progress}</span>}
      </div>
      <h1 className="serif head__title head__title--small">{name}</h1>
      <hr className="rule-line" />
    </header>
  )
}

/* ---------------- 말하기 ---------------- */

function SpeakPanel({
  phase,
  level,
  problem,
  result,
  audioUrl,
  canRecord,
  onStart,
  onStop,
  onSwitchToTyping,
}) {
  return (
    <section className="card stack">
      {phase === 'recording' ? (
        <>
          <LevelMeter level={level} />
          <button className="btn btn--primary btn--full" onClick={onStop}>
            다 말했어요
          </button>
          <p className="muted">
            소리가 들어오면 위 막대가 움직입니다. 막대가 전혀 움직이지 않으면 마이크가 잡히지 않는
            것입니다.
          </p>
        </>
      ) : phase === 'preparing' ? (
        <>
          <button className="btn btn--primary btn--full" disabled>
            준비하는 중
          </button>
          <p className="muted">처음 한 번은 채점 기능을 내려받느라 몇 초 걸립니다.</p>
        </>
      ) : phase === 'assessing' ? (
        <>
          <button className="btn btn--primary btn--full" disabled>
            채점하는 중
          </button>
          <p className="muted">Azure에 보내 채점하고 있습니다.</p>
        </>
      ) : (
        <button className="btn btn--primary btn--full" onClick={onStart} disabled={!canRecord}>
          {result ? '다시 녹음하기' : '녹음하기'}
        </button>
      )}

      {audioUrl && phase !== 'recording' && (
        <div className="stack">
          <span className="field__label">내 녹음</span>
          <audio className="player" src={audioUrl} controls preload="metadata" />
        </div>
      )}

      {problem && (
        <p className="notice notice--bad">
          {problem.message}
          {/* 인터넷 문제로 못 했을 때는 막지 말고 타이핑으로 가도록 길을 열어 준다 */}
          {(problem.kind === 'network' || problem.kind === 'offline') && (
            <button className="link-btn" onClick={onSwitchToTyping}>
              타이핑으로 바꾸기
            </button>
          )}
        </p>
      )}

      {result && <ScoreBoard scores={result.scores} overall={result.overall} mode="말하기" />}

      {result && (
        <>
          <hr className="rule-line" />
          <span className="field__label">Azure가 들은 문장</span>
          <p className="recognized">{result.recognizedText}</p>
          {result.words.length > 0 && <WordMarks words={result.words} />}
        </>
      )}
    </section>
  )
}

function LevelMeter({ level }) {
  // rms는 보통 아주 작은 값이라 눈에 보이게 늘린다
  const pct = Math.min(100, Math.round(level * 320))
  return (
    <div className="meter" role="img" aria-label={`입력 음량 ${pct}%`}>
      <span className="meter__fill" style={{ width: `${pct}%` }} />
    </div>
  )
}

function WordMarks({ words }) {
  return (
    <p className="word-marks">
      {words.map((w, i) => {
        const type =
          w.errorType === 'Omission'
            ? 'missing'
            : w.errorType === 'Insertion'
              ? 'extra'
              : w.errorType === 'Mispronunciation'
                ? 'wrong'
                : 'ok'
        return (
          <span key={`${w.word}-${i}`} className={`mark mark--${type}`}>
            {w.word}
            {type === 'missing' && <span className="mark__note">빠뜨림</span>}
            {type === 'extra' && <span className="mark__note">덧붙임</span>}
            {type === 'wrong' && Number.isFinite(w.accuracy) && (
              <span className="mark__note">{w.accuracy}</span>
            )}
          </span>
        )
      })}
    </p>
  )
}

/* ---------------- 타이핑 ---------------- */

function TypePanel({ phase, typed, setTyped, result, reference, onGrade }) {
  return (
    <section className="card stack">
      <div className="field">
        <label className="field__label" htmlFor="typed-answer">
          영어로 적어 보세요
        </label>
        <textarea
          id="typed-answer"
          className="input input--area"
          rows={3}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Type the English sentence."
          lang="en"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          disabled={phase === 'result'}
        />
        <span className="muted">
          자동 수정이 답을 정답으로 바꿔 점수가 부풀지 않도록 교정 기능을 꺼 두었습니다.
        </span>
      </div>

      {phase !== 'result' ? (
        <button className="btn btn--primary btn--full" onClick={onGrade} disabled={!typed.trim()}>
          채점하기
        </button>
      ) : (
        result && (
          <>
            <ScoreBoard overall={result.score} mode="타이핑" />
            <hr className="rule-line" />
            <span className="field__label">정답과 견주기</span>
            <p className="word-marks">
              {result.diff.map((d, i) => (
                <span key={i} className={`mark mark--${d.type}`}>
                  {d.word}
                  {d.type === 'missing' && <span className="mark__note">빠뜨림</span>}
                  {d.type === 'extra' && <span className="mark__note">덧붙임</span>}
                  {d.type === 'wrong' && <span className="mark__note">→ {d.expected}</span>}
                </span>
              ))}
            </p>
            <span className="field__label">정답</span>
            <p className="prompt-answer">{reference}</p>
          </>
        )
      )}
    </section>
  )
}

/* ---------------- 점수 ---------------- */

function ScoreBoard({ scores, overall, mode }) {
  const grade = scoreToGrade(overall)
  return (
    <div className="stack">
      <div className="score-head">
        <span className="score-big">{Number.isFinite(overall) ? overall : '-'}</span>
        <span className="score-side">
          <span className="score-grade">{gradeLabel(grade)}</span>
          <span className="muted">{mode}으로 받은 점수</span>
        </span>
      </div>

      {scores && (
        <div className="score-rows">
          <ScoreRow label="정확도" value={scores.accuracy} />
          <ScoreRow label="유창성" value={scores.fluency} />
          <ScoreRow label="완성도" value={scores.completeness} />
          {/* 운율은 계정·리전에 따라 안 올 수 있어, 없으면 줄 자체를 숨긴다 */}
          {Number.isFinite(scores.prosody) && <ScoreRow label="운율" value={scores.prosody} />}
        </div>
      )}
    </div>
  )
}

function ScoreRow({ label, value }) {
  const pct = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
  return (
    <div className="score-row">
      <span className="score-row__label">{label}</span>
      <span className="score-row__bar">
        <span className="score-row__fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="score-row__value">{Number.isFinite(value) ? value : '-'}</span>
    </div>
  )
}
