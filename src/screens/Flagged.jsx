import { useEffect, useMemo, useState } from 'react'
import { navigate } from '../router.js'
import CardRow from '../components/CardRow.jsx'
import { listAllCards, listFolders } from '../data.js'

/**
 * 어려운 문장 모음.
 * 플래그된 카드만 모아 본다. 암기 완료한 카드도 플래그돼 있으면 여기 나온다.
 */
export default function Flagged({ folderId }) {
  const [cards, setCards] = useState(null)
  const [folders, setFolders] = useState([])
  const [scope, setScope] = useState(folderId || 'all')

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
      .filter((c) => c.flagged)
      .filter((c) => scope === 'all' || c.folder_id === scope)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
  }, [cards, scope])

  const here = folderId ? folderById.get(folderId) : null
  const backTo = folderId ? `/folders/${folderId}` : '/'

  return (
    <>
      <header className="head">
        <button className="link-btn" onClick={() => navigate(backTo)}>
          돌아가기
        </button>
        <h1 className="serif head__title">어려운 문장</h1>
        <hr className="rule-line" />
      </header>

      {folders.length > 1 && (
        <div className="seg seg--tight">
          <button
            className={`seg__btn ${scope === 'all' ? 'is-on' : ''}`}
            onClick={() => setScope('all')}
          >
            전체 폴더
          </button>
          {here && (
            <button
              className={`seg__btn ${scope === here.id ? 'is-on' : ''}`}
              onClick={() => setScope(here.id)}
            >
              {here.name}
            </button>
          )}
        </div>
      )}

      <section className="card stack">
        {cards === null ? (
          <p className="muted">불러오는 중…</p>
        ) : flagged.length === 0 ? (
          <p className="muted">
            아직 어려움으로 표시한 문장이 없습니다. 복습하다가 잘 안 되는 문장을 만나면 어려움으로
            표시해 두세요. 여기 모아서 다시 볼 수 있습니다.
          </p>
        ) : (
          <>
            <p className="muted">{flagged.length}장</p>
            <ul className="card-list">
              {flagged.map((card) => (
                <CardRow
                  key={card.id}
                  card={card}
                  folder={folderById.get(card.folder_id)}
                  showFolderName={scope === 'all'}
                  onClick={() => navigate(`/cards/${card.id}/edit`)}
                />
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  )
}
