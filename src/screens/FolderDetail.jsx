import { useEffect, useState } from 'react'
import { navigate } from '../router.js'
import { colorVar } from '../colors.js'
import { countDueToday, getFolder, getSession, listCards } from '../data.js'

/**
 * 복습 횟수 배지.
 * 숫자는 폴더 색 동그라미 안에 넣어 눈에 띄게 하고, 아직 안 본 카드는 글자로 둔다.
 * 판단 기준은 status가 아니라 attempt_count다 — status는 암기 완료 여부를 나타낸다.
 */
export function AttemptBadge({ card, color }) {
  if (!card.attempt_count) {
    return <span className="badge-count">새 카드</span>
  }
  return (
    <span
      className={`badge-round ${color ? '' : 'badge-round--muted'}`}
      style={color ? { background: colorVar(color) } : undefined}
      title={`복습 ${card.attempt_count}회`}
    >
      {card.attempt_count}
    </span>
  )
}

export default function FolderDetail({ folderId }) {
  const [folder, setFolder] = useState(null)
  const [cards, setCards] = useState(null)
  const [missing, setMissing] = useState(false)
  const [session, setSession] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const f = await getFolder(folderId)
      if (!alive) return
      if (!f) {
        setMissing(true)
        return
      }
      setFolder(f)
      const list = await listCards(folderId)
      if (!alive) return
      setCards(list)
      setSession(await getSession(folderId))
    })()
    return () => {
      alive = false
    }
  }, [folderId])

  if (missing) {
    return (
      <>
        <p className="notice notice--bad">폴더를 찾지 못했습니다.</p>
        <button className="btn btn--full" onClick={() => navigate('/')}>
          폴더 목록으로
        </button>
      </>
    )
  }

  if (!folder || cards === null) return <p className="muted">불러오는 중…</p>

  const completed = cards.filter((c) => c.status === 'completed').length
  const remaining = session
    ? Math.max(0, session.card_ids.length - session.current_index)
    : countDueToday(cards, folder.daily_target)
  const sessionText = session
    ? remaining > 0
      ? `오늘 묶음 ${session.card_ids.length}장 가운데 ${remaining}장 남았습니다.`
      : '오늘 몫을 끝냈습니다.'
    : remaining > 0
      ? `오늘 볼 카드 ${remaining}장`
      : '오늘 볼 카드가 없습니다.'

  return (
    <>
      <header className="head">
        <button className="link-btn" onClick={() => navigate('/')}>
          폴더 목록
        </button>
        <div className="head--row">
          <h1 className="serif head__title">
            <span className="folder-dot" style={{ background: colorVar(folder.color) }} />
            {folder.name}
          </h1>
          <button className="link-btn" onClick={() => navigate(`/folders/${folderId}/edit`)}>
            폴더 설정
          </button>
        </div>
        <hr className="rule-line" />
        <p className="muted">
          전체 {cards.length}장<span className="folder-item__gap" />완료 {completed}장
        </p>
      </header>

      <section className="card stack">
        <h2 className="section-title">오늘의 학습</h2>
        <p>{sessionText}</p>
        <button
          className="btn btn--primary btn--full"
          onClick={() => navigate(`/folders/${folderId}/review`)}
          disabled={cards.length === 0}
        >
          {!session ? '오늘의 학습 시작하기' : remaining > 0 ? '이어서 하기' : '더 하기'}
        </button>
        <p className="muted">
          하루 목표는 {folder.daily_target}장입니다. 복습일이 아직 안 된 카드는 끌어오지 않으므로
          목표보다 적을 수 있습니다.
        </p>
      </section>

      <section className="card stack">
        <div className="head--row">
          <h2 className="section-title">카드 {cards.length}장</h2>
          <span className="head__actions">
            {cards.length > 0 && (
              <button
                className="link-btn"
                onClick={() => navigate(`/folders/${folderId}/search`)}
              >
                찾기
              </button>
            )}
            <button
              className="link-btn"
              onClick={() => navigate(`/folders/${folderId}/cards/new`)}
            >
              카드 추가
            </button>
          </span>
        </div>

        {cards.length === 0 ? (
          <p className="muted">
            아직 카드가 없습니다. 한국어 문장과 정답 영어 문장을 한 쌍씩 넣어 주세요.
          </p>
        ) : (
          <ul className="card-list">
            {cards.map((card) => {
              const done = card.status === 'completed'
              return (
                <li key={card.id} className={`card-row ${done ? 'is-done' : ''}`}>
                  {/* 학습 중인 카드만 폴더 색을 띤다. 완료한 카드는 색을 거두어
                      한눈에 "이건 이제 안 봐도 되는 카드"로 읽히게 한다 */}
                  <span
                    className="card-row__edge"
                    style={done ? undefined : { background: colorVar(folder.color) }}
                    aria-hidden="true"
                  />
                  <button
                    className="card-row__main"
                    onClick={() => navigate(`/cards/${card.id}/edit`)}
                  >
                    <span className="card-row__top">
                      <span className="serif card-row__ko">{card.korean_text}</span>
                      <AttemptBadge card={card} color={done ? null : folder.color} />
                    </span>
                    <span className="card-row__en">{card.english_text}</span>
                    {done && <span className="card-row__done">암기 완료</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {cards.length > 0 && (
        <button
          className="btn btn--primary btn--full"
          onClick={() => navigate(`/folders/${folderId}/cards/new`)}
        >
          카드 추가하기
        </button>
      )}
    </>
  )
}
