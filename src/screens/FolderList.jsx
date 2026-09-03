import { useEffect, useState } from 'react'
import { navigate } from '../router.js'
import { colorVar } from '../colors.js'
import { listAllCards, listFolders, listSessions, moveFolder, summarizeFolders } from '../data.js'

export default function FolderList() {
  const [rows, setRows] = useState(null)
  const [reordering, setReordering] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [folders, cards, sessions] = await Promise.all([
      listFolders(),
      listAllCards(),
      listSessions(),
    ])
    setRows(summarizeFolders(folders, cards, sessions))
  }

  async function handleMove(id, direction) {
    await moveFolder(id, direction)
    load()
  }

  if (rows === null) {
    return (
      <>
        <Header showSearch={false} />
        <p className="muted">불러오는 중…</p>
      </>
    )
  }

  return (
    <>
      <Header showSearch={rows.length > 0} />

      {rows.length === 0 ? (
        <section className="card stack">
          <h2 className="section-title">폴더가 없습니다</h2>
          <p className="muted">
            문장은 반드시 폴더 하나에 들어갑니다. 주제별로 나눠 담으면 폴더 단위로 복습할 수
            있습니다. 예를 들어 입트영, 원서 표현, 대학원 영어처럼요.
          </p>
          <button className="btn btn--primary btn--full" onClick={() => navigate('/folders/new')}>
            첫 폴더 만들기
          </button>
        </section>
      ) : (
        <>
          <ul className="folder-list">
            {rows.map(({ folder, total, completed, today, started, sessionDone }, i) => (
              <li key={folder.id} className="folder-item">
                <span className="folder-item__tab" style={{ background: colorVar(folder.color) }} />

                <button className="folder-item__main" onClick={() => navigate(`/folders/${folder.id}`)}>
                  <span className="serif folder-item__name">{folder.name}</span>
                  <span className="folder-item__today">
                    {sessionDone
                      ? '오늘 몫 끝'
                      : today === 0
                        ? '오늘 볼 카드 없음'
                        : started
                          ? `오늘 ${today}장 남음`
                          : `오늘 ${today}장`}
                  </span>
                  <span className="folder-item__meta muted">
                    전체 {total}장
                    <span className="folder-item__gap" />
                    완료 {completed}장
                  </span>
                </button>

                {reordering && (
                  <span className="folder-item__order">
                    <button
                      className="btn btn--tight"
                      onClick={() => handleMove(folder.id, 'up')}
                      disabled={i === 0}
                      aria-label={`${folder.name} 위로`}
                    >
                      위로
                    </button>
                    <button
                      className="btn btn--tight"
                      onClick={() => handleMove(folder.id, 'down')}
                      disabled={i === rows.length - 1}
                      aria-label={`${folder.name} 아래로`}
                    >
                      아래로
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>

          <div className="btn-row">
            <button className="btn btn--primary" onClick={() => navigate('/folders/new')}>
              폴더 만들기
            </button>
            <button className="btn" onClick={() => setReordering((v) => !v)}>
              {reordering ? '순서 다 바꿨어요' : '순서 바꾸기'}
            </button>
          </div>
        </>
      )}
    </>
  )
}

function Header({ showSearch }) {
  return (
    <header className="head">
      {/* 제목이 한 줄을 온전히 쓰도록 동작들은 아래 줄 오른쪽으로 내린다 */}
      <h1 className="serif head__title">영어문장모음집</h1>
      <div className="head__actions head__actions--below">
        {showSearch && (
          <>
            <button className="link-btn" onClick={() => navigate('/flagged')}>
              표시한 문장
            </button>
            <button className="link-btn" onClick={() => navigate('/search')}>
              카드 찾기
            </button>
          </>
        )}
        <button className="link-btn" onClick={() => navigate('/settings')}>
          설정
        </button>
      </div>
      <hr className="rule-line" />
    </header>
  )
}
