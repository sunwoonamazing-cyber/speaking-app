import { useEffect, useMemo, useRef, useState } from 'react'
import { navigate } from '../router.js'
import { colorVar } from '../colors.js'
import { listAllCards, listFolders } from '../data.js'
import { AttemptBadge } from './FolderDetail.jsx'

/** 비교 전에 대소문자·군더더기 공백을 정리한다 */
function normalize(s) {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

const MAX_RESULTS = 200

export default function CardSearch({ folderId }) {
  const [query, setQuery] = useState('')
  const [cards, setCards] = useState(null)
  const [folders, setFolders] = useState([])
  const [scopeAll, setScopeAll] = useState(!folderId)
  const inputRef = useRef(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [f, c] = await Promise.all([listFolders(), listAllCards()])
      if (!alive) return
      setFolders(f)
      setCards(c)
      inputRef.current?.focus()
    })()
    return () => {
      alive = false
    }
  }, [])

  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders])
  const here = folderId ? folderById.get(folderId) : null

  const results = useMemo(() => {
    if (!cards) return []
    const q = normalize(query)
    if (!q) return []
    const pool = scopeAll ? cards : cards.filter((c) => c.folder_id === folderId)
    return pool
      .filter((c) => normalize(c.korean_text).includes(q) || normalize(c.english_text).includes(q))
      .slice(0, MAX_RESULTS)
  }, [cards, query, scopeAll, folderId])

  const searchedCount = useMemo(() => {
    if (!cards) return 0
    return scopeAll ? cards.length : cards.filter((c) => c.folder_id === folderId).length
  }, [cards, scopeAll, folderId])

  const backTo = folderId ? `/folders/${folderId}` : '/'

  return (
    <>
      <header className="head">
        <button className="link-btn" onClick={() => navigate(backTo)}>
          돌아가기
        </button>
        <h1 className="serif head__title">카드 찾기</h1>
        <hr className="rule-line" />
      </header>

      <section className="card stack">
        <div className="field">
          <label className="field__label" htmlFor="card-search">
            찾을 말
          </label>
          <input
            id="card-search"
            ref={inputRef}
            className="input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="한국어 또는 영어 일부"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
          />
        </div>

        {here && (
          <div className="seg">
            <button
              className={`seg__btn ${!scopeAll ? 'is-on' : ''}`}
              onClick={() => setScopeAll(false)}
            >
              {here.name}
            </button>
            <button
              className={`seg__btn ${scopeAll ? 'is-on' : ''}`}
              onClick={() => setScopeAll(true)}
            >
              전체 폴더
            </button>
          </div>
        )}

        <p className="muted">
          {cards === null
            ? '불러오는 중…'
            : query.trim() === ''
              ? `카드 ${searchedCount}장에서 찾습니다.`
              : `${results.length}장 찾았습니다.${
                  results.length === MAX_RESULTS ? ' (너무 많아 앞부분만 보여줍니다)' : ''
                }`}
        </p>
      </section>

      {query.trim() !== '' && results.length === 0 && cards !== null && (
        <section className="card stack">
          <p className="muted">찾는 카드가 없습니다. 다른 낱말로 찾아보세요.</p>
        </section>
      )}

      {results.length > 0 && (
        <section className="card stack">
          <ul className="card-list">
            {results.map((card) => {
              const folder = folderById.get(card.folder_id)
              return (
                <li key={card.id} className="card-row">
                  <span
                    className="card-row__edge"
                    style={{ background: colorVar(folder?.color) }}
                    aria-hidden="true"
                  />
                  <button
                    className="card-row__main"
                    onClick={() => navigate(`/cards/${card.id}/edit`)}
                  >
                    <span className="card-row__top">
                      <span className="serif card-row__ko">{card.korean_text}</span>
                      <AttemptBadge card={card} />
                    </span>
                    <span className="card-row__en">{card.english_text}</span>
                    {scopeAll && folder && (
                      <span className="muted card-row__status">{folder.name}</span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </>
  )
}
