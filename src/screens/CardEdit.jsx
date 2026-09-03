import { useEffect, useRef, useState } from 'react'
import { navigate } from '../router.js'
import { createCard, deleteCard, getCard, getFolder, updateCard } from '../data.js'
import { requestPersistentStorage } from '../db.js'

export default function CardEdit({ folderId, cardId }) {
  const isNew = !cardId

  const [ready, setReady] = useState(false)
  const [missing, setMissing] = useState(false)
  const [folder, setFolder] = useState(null)
  const [card, setCard] = useState(null)

  const [korean, setKorean] = useState('')
  const [english, setEnglish] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [justAdded, setJustAdded] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const koreanRef = useRef(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (isNew) {
        const f = await getFolder(folderId)
        if (!alive) return
        if (!f) {
          setMissing(true)
          return
        }
        setFolder(f)
      } else {
        const c = await getCard(cardId)
        if (!alive) return
        if (!c) {
          setMissing(true)
          return
        }
        setCard(c)
        setKorean(c.korean_text)
        setEnglish(c.english_text)
        const f = await getFolder(c.folder_id)
        if (!alive) return
        setFolder(f || null)
      }
      setReady(true)
    })()
    return () => {
      alive = false
    }
  }, [folderId, cardId, isNew])

  const backTo = folder ? `/folders/${folder.id}` : '/'

  function validate() {
    if (!korean.trim()) return '한국어 문장을 적어 주세요.'
    if (!english.trim()) return '정답 영어 문장을 적어 주세요.'
    return null
  }

  async function save({ keepGoing }) {
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (isNew) {
        await createCard({
          folder_id: folder.id,
          korean_text: korean,
          english_text: english,
        })
        // 명세: 저장소 보호는 카드를 저장하는 것처럼 사용자가 버튼을 누른 직후에 요청한다
        await requestPersistentStorage()

        if (keepGoing) {
          setKorean('')
          setEnglish('')
          setJustAdded((n) => n + 1)
          setSaving(false)
          koreanRef.current?.focus()
          return
        }
      } else {
        await updateCard(cardId, { korean_text: korean, english_text: english })
      }
      navigate(backTo)
    } catch (err) {
      setError(err.message || '저장하지 못했습니다.')
      setSaving(false)
    }
  }

  async function handleDelete() {
    setSaving(true)
    try {
      await deleteCard(cardId)
      navigate(backTo)
    } catch (err) {
      setError(err.message || '지우지 못했습니다.')
      setSaving(false)
    }
  }

  if (missing) {
    return (
      <>
        <p className="notice notice--bad">
          {isNew ? '폴더를 찾지 못했습니다.' : '카드를 찾지 못했습니다.'}
        </p>
        <button className="btn btn--full" onClick={() => navigate('/')}>
          폴더 목록으로
        </button>
      </>
    )
  }

  if (!ready) return <p className="muted">불러오는 중…</p>

  return (
    <>
      <header className="head">
        <button className="link-btn" onClick={() => navigate(backTo)}>
          돌아가기
        </button>
        <h1 className="serif head__title">{isNew ? '카드 추가' : '카드 수정'}</h1>
        <hr className="rule-line" />
        {folder && <p className="muted">{folder.name}</p>}
      </header>

      <section className="card stack">
        <div className="field">
          <label className="field__label" htmlFor="card-ko">
            한국어 문장
          </label>
          <textarea
            id="card-ko"
            ref={koreanRef}
            className="input input--area serif"
            rows={2}
            value={korean}
            onChange={(e) => {
              setKorean(e.target.value)
              setError(null)
            }}
            placeholder="복습할 때 보여줄 한국어 문장"
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="card-en">
            정답 영어 문장
          </label>
          <textarea
            id="card-en"
            className="input input--area"
            rows={2}
            value={english}
            onChange={(e) => {
              setEnglish(e.target.value)
              setError(null)
            }}
            placeholder="This is the answer sentence."
            lang="en"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
          />
          <span className="muted">
            휴대폰 자동 수정이 문장을 바꾸지 않도록 이 칸은 교정 기능을 꺼 두었습니다.
          </span>
        </div>

        {error && <p className="notice notice--bad">{error}</p>}

        {isNew ? (
          <>
            <button
              className="btn btn--primary btn--full"
              onClick={() => save({ keepGoing: true })}
              disabled={saving}
            >
              저장하고 다음 카드
            </button>
            <button
              className="btn btn--full"
              onClick={() => save({ keepGoing: false })}
              disabled={saving}
            >
              저장하고 목록으로
            </button>
            {justAdded > 0 && (
              <p className="notice notice--ok">이번에 {justAdded}장 넣었습니다.</p>
            )}
          </>
        ) : (
          <button
            className="btn btn--primary btn--full"
            onClick={() => save({ keepGoing: false })}
            disabled={saving}
          >
            저장하기
          </button>
        )}
      </section>

      {!isNew && card && (
        <section className="card stack">
          <h2 className="section-title">이 카드의 기록</h2>
          <div className="check-row">
            <span className="check-row__label">복습 횟수</span>
            <span className="check-row__value">
              {card.attempt_count > 0 ? `${card.attempt_count}회` : '아직 없음'}
            </span>
          </div>
          <div className="check-row">
            <span className="check-row__label">상태</span>
            <span className="check-row__value">
              {card.status === 'new'
                ? '새 카드'
                : card.status === 'learning'
                  ? '학습 중'
                  : '암기 완료'}
            </span>
          </div>

          <hr className="rule-line" />

          {!confirmDelete ? (
            <button className="link-btn link-btn--danger" onClick={() => setConfirmDelete(true)}>
              이 카드 지우기
            </button>
          ) : (
            <>
              <p className="notice notice--bad">이 카드를 지웁니다. 되돌릴 수 없습니다.</p>
              <div className="btn-row">
                <button className="btn" onClick={() => setConfirmDelete(false)} disabled={saving}>
                  그만두기
                </button>
                <button className="btn btn--danger" onClick={handleDelete} disabled={saving}>
                  지우기
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </>
  )
}
