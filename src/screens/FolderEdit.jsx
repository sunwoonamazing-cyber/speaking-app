import { useEffect, useState } from 'react'
import { navigate } from '../router.js'
import { FOLDER_COLORS, colorVar, pickUnusedColor } from '../colors.js'
import {
  DAILY_TARGET_PRESETS,
  DEFAULT_DAILY_TARGET,
  createFolder,
  deleteFolder,
  listCards,
  listFolders,
  updateFolder,
} from '../data.js'
import { requestPersistentStorage } from '../db.js'

export default function FolderEdit({ folderId }) {
  const isNew = !folderId

  const [ready, setReady] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState(null)
  const [dailyTarget, setDailyTarget] = useState(DEFAULT_DAILY_TARGET)
  const [defaultMode, setDefaultMode] = useState('speak')

  const [others, setOthers] = useState([]) // 삭제할 때 카드를 옮길 후보 폴더
  const [cardCount, setCardCount] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [cardAction, setCardAction] = useState('move')
  const [targetFolderId, setTargetFolderId] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const folders = await listFolders()
      if (!alive) return

      const rest = folders.filter((f) => f.id !== folderId)
      setOthers(rest)
      setTargetFolderId(rest[0]?.id || '')

      if (isNew) {
        setColor(pickUnusedColor(folders))
      } else {
        const folder = folders.find((f) => f.id === folderId)
        if (!folder) {
          navigate('/')
          return
        }
        setName(folder.name)
        setColor(folder.color)
        setDailyTarget(folder.daily_target ?? DEFAULT_DAILY_TARGET)
        setDefaultMode(folder.default_mode || 'speak')
        const cards = await listCards(folderId)
        if (!alive) return
        setCardCount(cards.length)
        // 옮길 곳이 없으면 함께 삭제만 가능하다
        if (rest.length === 0) setCardAction('delete')
      }
      setReady(true)
    })()
    return () => {
      alive = false
    }
  }, [folderId, isNew])

  async function handleSave() {
    if (!name.trim()) {
      setError('폴더 이름을 적어 주세요.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name,
        color,
        daily_target: Number(dailyTarget) || DEFAULT_DAILY_TARGET,
        default_mode: defaultMode,
      }
      if (isNew) {
        const folder = await createFolder(payload)
        // 명세: 저장소 보호는 사용자가 버튼을 누른 직후에 요청한다
        await requestPersistentStorage()
        navigate(`/folders/${folder.id}`)
      } else {
        await updateFolder(folderId, payload)
        navigate(`/folders/${folderId}`)
      }
    } catch (err) {
      setError(err.message || '저장하지 못했습니다.')
      setSaving(false)
    }
  }

  async function handleDelete() {
    setSaving(true)
    setError(null)
    try {
      await deleteFolder(folderId, { cardAction, targetFolderId })
      navigate('/')
    } catch (err) {
      setError(err.message || '삭제하지 못했습니다.')
      setSaving(false)
    }
  }

  if (!ready) {
    return <p className="muted">불러오는 중…</p>
  }

  return (
    <>
      <header className="head">
        <button className="link-btn" onClick={() => navigate(isNew ? '/' : `/folders/${folderId}`)}>
          돌아가기
        </button>
        <h1 className="serif head__title">{isNew ? '폴더 만들기' : '폴더 설정'}</h1>
        <hr className="rule-line" />
      </header>

      <section className="card stack">
        <div className="field">
          <label className="field__label" htmlFor="folder-name">
            이름
          </label>
          <input
            id="folder-name"
            className="input"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            placeholder="예: 입트영"
            autoComplete="off"
          />
        </div>

        <div className="field">
          <span className="field__label">색</span>
          <div className="color-picker">
            {FOLDER_COLORS.map((c) => (
              <button
                key={c.key}
                className={`color-chip ${color === c.key ? 'is-on' : ''}`}
                onClick={() => setColor(c.key)}
                aria-label={c.label}
                aria-pressed={color === c.key}
                title={c.label}
              >
                <span className="color-chip__bar" style={{ background: colorVar(c.key) }} />
                <span className="color-chip__label">{c.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="card stack">
        <h2 className="section-title">하루 목표</h2>
        <div className="seg">
          {DAILY_TARGET_PRESETS.map((n) => (
            <button
              key={n}
              className={`seg__btn ${Number(dailyTarget) === n ? 'is-on' : ''}`}
              onClick={() => setDailyTarget(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="field">
          <label className="field__label" htmlFor="daily-target">
            직접 입력
          </label>
          <input
            id="daily-target"
            className="input"
            type="number"
            inputMode="numeric"
            min="1"
            max="999"
            value={dailyTarget}
            onChange={(e) => setDailyTarget(e.target.value)}
          />
        </div>
        <p className="muted">
          이 폴더에서 하루에 볼 카드 수입니다. 폴더마다 따로 정할 수 있습니다.
        </p>
      </section>

      <section className="card stack">
        <h2 className="section-title">기본 답변 방식</h2>
        <div className="seg">
          {[
            { value: 'speak', label: '말하기' },
            { value: 'type', label: '타이핑' },
          ].map((o) => (
            <button
              key={o.value}
              className={`seg__btn ${defaultMode === o.value ? 'is-on' : ''}`}
              onClick={() => setDefaultMode(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="muted">복습 도중에도 카드 단위로 바꿀 수 있습니다.</p>
      </section>

      {error && <p className="notice notice--bad">{error}</p>}

      <div className="btn-row btn-row--spaced">
        <button className="btn btn--primary" onClick={handleSave} disabled={saving}>
          {isNew ? '폴더 만들기' : '저장하기'}
        </button>
      </div>

      {!isNew && (
        <section className="card stack">
          <h2 className="section-title">폴더 지우기</h2>

          {!confirmDelete ? (
            <button className="link-btn link-btn--danger" onClick={() => setConfirmDelete(true)}>
              이 폴더 지우기
            </button>
          ) : (
            <>
              {cardCount > 0 ? (
                <>
                  <p>
                    이 폴더에 카드 {cardCount}장이 들어 있습니다. 어떻게 할까요?
                  </p>
                  <div className="seg">
                    <button
                      className={`seg__btn ${cardAction === 'move' ? 'is-on' : ''}`}
                      onClick={() => setCardAction('move')}
                      disabled={others.length === 0}
                    >
                      다른 폴더로 옮기기
                    </button>
                    <button
                      className={`seg__btn ${cardAction === 'delete' ? 'is-on' : ''}`}
                      onClick={() => setCardAction('delete')}
                    >
                      함께 지우기
                    </button>
                  </div>

                  {cardAction === 'move' &&
                    (others.length === 0 ? (
                      <p className="muted">
                        옮길 폴더가 없습니다. 먼저 폴더를 하나 더 만들거나, 카드를 함께 지우세요.
                      </p>
                    ) : (
                      <div className="field">
                        <label className="field__label" htmlFor="move-target">
                          옮길 폴더
                        </label>
                        <select
                          id="move-target"
                          className="input"
                          value={targetFolderId}
                          onChange={(e) => setTargetFolderId(e.target.value)}
                        >
                          {others.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}

                  {cardAction === 'delete' && (
                    <p className="notice notice--bad">
                      카드 {cardCount}장이 함께 사라집니다. 되돌릴 수 없습니다.
                    </p>
                  )}
                </>
              ) : (
                <p>빈 폴더입니다. 지울까요?</p>
              )}

              <div className="btn-row">
                <button className="btn" onClick={() => setConfirmDelete(false)} disabled={saving}>
                  그만두기
                </button>
                <button
                  className="btn btn--danger"
                  onClick={handleDelete}
                  disabled={
                    saving || (cardCount > 0 && cardAction === 'move' && !targetFolderId)
                  }
                >
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
