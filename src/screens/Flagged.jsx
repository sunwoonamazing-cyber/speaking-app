import { useEffect, useMemo, useState } from 'react'
import { navigate } from '../router.js'
import CardRow from '../components/CardRow.jsx'
import { listAllCards, listFolders } from '../data.js'
import { FLAGS, cardFlag, flagVar } from '../flags.js'

/**
 * 색깔 표시한 문장 모음.
 * 같은 색끼리 묶어 보여주고, 색 하나만 골라 볼 수도 있다.
 * 암기 완료한 카드도 표시돼 있으면 여기 나온다.
 */
export default function Flagged({ folderId }) {
  const [cards, setCards] = useState(null)
  const [folders, setFolders] = useState([])
  const [scope, setScope] = useState(folderId || 'all')
  const [colorFilter, setColorFilter] = useState('all')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [f, c] = await Promise.all([listFolders(), listAllCards()])
      if (!alive) return
      setFolders(f)
      setCards(c)
    })()
    return () => {
      alive = false
    }
  }, [])

  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders])

  const flagged = useMemo(() => {
    if (!cards) return []
    return cards
      .filter((c) => cardFlag(c))
      .filter((c) => scope === 'all' || c.folder_id === scope)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
  }, [cards, scope])

  /** 색깔별로 묶는다. 팔레트 순서를 지켜 화면이 매번 같은 순서로 보이게 한다. */
  const groups = useMemo(() => {
    return FLAGS.map((f) => ({
      flag: f,
      cards: flagged.filter((c) => cardFlag(c) === f.key),
    })).filter((g) => g.cards.length > 0)
  }, [flagged])

  const shown = colorFilter === 'all' ? groups : groups.filter((g) => g.flag.key === colorFilter)
  const here = folderId ? folderById.get(folderId) : null
  const backTo = folderId ? `/folders/${folderId}` : '/'

  return (
    <>
      <header className="head">
        <button className="link-btn" onClick={() => navigate(backTo)}>
          돌아가기
        </button>
        <h1 className="serif head__title">표시한 문장</h1>
        <hr className="rule-line" />
      </header>

      {folders.length > 1 && here && (
        <div className="seg seg--tight">
          <button
            className={`seg__btn ${scope === 'all' ? 'is-on' : ''}`}
            onClick={() => setScope('all')}
          >
            전체 폴더
          </button>
          <button
            className={`seg__btn ${scope === here.id ? 'is-on' : ''}`}
            onClick={() => setScope(here.id)}
          >
            {here.name}
          </button>
        </div>
      )}

      {groups.length > 0 && (
        <div className="flag-filter">
          <button
            className={`flag-chip ${colorFilter === 'all' ? 'is-on' : ''}`}
            onClick={() => setColorFilter('all')}
          >
            전체 {flagged.length}
          </button>
          {groups.map((g) => (
            <button
              key={g.flag.key}
              className={`flag-chip ${colorFilter === g.flag.key ? 'is-on' : ''}`}
              style={{ '--dot': flagVar(g.flag.key) }}
              onClick={() => setColorFilter(g.flag.key)}
            >
              <span className="flag-chip__dot" />
              {g.flag.label} {g.cards.length}
            </button>
          ))}
        </div>
      )}

      {cards === null ? (
        <section className="card stack">
          <p className="muted">불러오는 중…</p>
        </section>
      ) : flagged.length === 0 ? (
        <section className="card stack">
          <p className="muted">
            아직 색깔로 표시한 문장이 없습니다. 복습하다가 다시 볼 문장을 만나면 색을 하나 골라
            표시해 두세요. 여기에 색깔별로 모입니다.
          </p>
        </section>
      ) : (
        shown.map((g) => (
          <section key={g.flag.key} className="card stack">
            <div className="head--row">
              <h2 className="section-title">
                <span className="flag-heading__dot" style={{ background: flagVar(g.flag.key) }} />
                {g.flag.label}
              </h2>
              <span className="muted">{g.cards.length}장</span>
            </div>
            <ul className="card-list">
              {g.cards.map((card) => (
                <CardRow
                  key={card.id}
                  card={card}
                  folder={folderById.get(card.folder_id)}
                  showFolderName={scope === 'all'}
                  onClick={() => navigate(`/cards/${card.id}/edit`)}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  )
}
