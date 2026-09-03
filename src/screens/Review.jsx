import { useCallback, useEffect, useRef, useState } from 'react'
import { navigate } from '../router.js'
import { getFolder, listCards, updateCard } from '../data.js'
import { MicRecorder } from '../audio/recorder.js'
import { createPushStream, overallScore, startAssessment } from '../speech/assess.js'
import { scoreTyping } from '../speech/typing.js'
import { gradeLabel, isPass, scoreToGrade } from '../sm2.js'

const MAX_RECORD_SECONDS = 30

export default function Review({ folderId, settings }) {
  const [folder, setFolder] = useState(null)
  const [cards, setCards] = useState(null)
  const [index, setIndex] = useState(0)
  const [mode, setMode] = useState('speak')

  const [phase, setPhase] = useState('ready') // ready | preparing | recording | assessing | result
  const [level, setLevel] = useState(0)
  const [result, setResult] = useState(null) // 말하기 채점 결과
  const [typed, setTyped] = useState('')
  const [typeResult, setTypeResult] = useState(null)
  const [problem, setProblem] = useState(null) // { kind, message }
  const [reveal, setReveal] = useState(false)
  const [audioUrl, setAudioUrl] = useState(null)
  const [online, setOnline] = useState(navigator.onLine)

  const recorderRef = useRef(null)
  const pushStreamRef = useRef(null)
  const assessRef = useRef(null)
  const autoStopRef = useRef(null)

  const card = cards?.[index] || null

  useEffect(() => {
    let alive = true
    ;(async () => {
      const f = await getFolder(folderId)
      if (!alive) return
      if (!f) {
        navigate('/')
        return
      }
      setFolder(f)
      setMode(f.default_mode || 'speak')
      const all = await listCards(folderId)
      if (!alive) return
      // 6단계에서 오늘의 묶음 규칙과 세션 저장으로 바뀐다.
      // 지금은 완료되지 않은 카드를 등록 순서대로 본다.
      setCards(all.filter((c) => c.status !== 'completed'))
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

  // 화면을 벗어날 때 마이크와 연결을 확실히 놓아준다
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
    setAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }, [])

  const hasKey = Boolean(settings.azure_key && settings.azure_region)

  /** 채점 결과를 카드에 남긴다. 일정(SM-2)은 6단계에서 붙는다. */
  async function recordAttempt(scoreValue, usedMode, scores) {
    if (!card) return
    const grade = scoreToGrade(scoreValue)
    const next = {
      attempt_count: (card.attempt_count || 0) + 1,
      fail_count: (card.fail_count || 0) + (isPass(grade) ? 0 : 1),
      last_scores: scores || null,
      last_avg_score: scoreValue,
      last_mode: usedMode,
    }
    await updateCard(card.id, next)
    setCards((prev) => {
      if (!prev) return prev
      const copy = [...prev]
      copy[index] = { ...copy[index], ...next }
      return copy
    })
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
    setAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })

    setPhase('preparing')
    const pushStream = await createPushStream()
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

    assessRef.current = await startAssessment({
      key: settings.azure_key,
      region: settings.azure_region,
      language: settings.accent || 'en-US',
      referenceText: card.english_text,
      pushStream,
    })

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

    const outcome = await assessment.promise
    recorderRef.current = null
    assessRef.current = null
    pushStreamRef.current = null

    if (!outcome.ok) {
      if (outcome.reason === 'nomatch') {
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
        setProblem({ kind: outcome.reason, message: outcome.message })
      }
      setPhase('ready')
      return
    }

    setResult(outcome)
    setPhase('result')
    await recordAttempt(outcome.overall ?? overallScore(outcome.scores), 'speak', outcome.scores)
  }

  async function gradeTyping() {
    if (!card) return
    const outcome = scoreTyping(typed, card.english_text)
    setTypeResult(outcome)
    setPhase('result')
    await recordAttempt(outcome.score, 'type', null)
  }

  function goNext() {
    resetCardState()
    setIndex((i) => i + 1)
  }

  function switchMode(next) {
    if (phase === 'preparing' || phase === 'recording' || phase === 'assessing') return
    setMode(next)
    setProblem(null)
  }

  /* ---------------- 화면 ---------------- */

  if (!folder || cards === null) return <p className="muted">불러오는 중…</p>

  if (cards.length === 0) {
    return (
      <>
        <ReviewHeader folder={folder} />
        <section className="card stack">
          <p>이 폴더에 복습할 카드가 없습니다.</p>
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
        <ReviewHeader folder={folder} />
        <section className="card stack">
          <h2 className="serif done-title">오늘 몫을 끝냈습니다</h2>
          <hr className="rule-line" />
          <p className="muted">카드 {cards.length}장을 봤습니다.</p>
          <button className="btn btn--primary btn--full" onClick={() => navigate(`/folders/${folderId}`)}>
            폴더로 돌아가기
          </button>
          <button
            className="btn btn--full"
            onClick={() => {
              resetCardState()
              setIndex(0)
            }}
          >
            처음부터 다시 보기
          </button>
        </section>
      </>
    )
  }

  const busy = phase === 'preparing' || phase === 'recording' || phase === 'assessing'

  return (
    <>
      <ReviewHeader folder={folder} progress={`${index + 1} / ${cards.length}`} />

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

      {phase === 'result' && (
        <button className="btn btn--primary btn--full btn-row--spaced" onClick={goNext}>
          {index + 1 < cards.length ? '다음 카드' : '끝내기'}
        </button>
      )}
    </>
  )
}

function ReviewHeader({ folder, progress }) {
  return (
    <header className="head">
      <div className="head--row">
        <button className="link-btn" onClick={() => navigate(`/folders/${folder.id}`)}>
          그만하기
        </button>
        {progress && <span className="progress">{progress}</span>}
      </div>
      <h1 className="serif head__title head__title--small">{folder.name}</h1>
      <hr className="rule-line" />
    </header>
  )
}

/* ---------------- 말하기 ---------------- */

function SpeakPanel({ phase, level, problem, result, audioUrl, canRecord, onStart, onStop }) {
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
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio className="player" src={audioUrl} controls preload="metadata" />
        </div>
      )}

      {problem && <p className="notice notice--bad">{problem.message}</p>}

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
        <button
          className="btn btn--primary btn--full"
          onClick={onGrade}
          disabled={!typed.trim()}
        >
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
