import { colorVar } from '../colors.js'

/**
 * 복습 횟수 배지.
 * 숫자는 폴더 색 동그라미 안에 넣고, 아직 안 본 카드는 글자로 둔다.
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

/** 어려움 표시 — flag 색은 이 자리에만 쓴다 */
export function FlagMark() {
  return (
    <span className="flag-mark" title="어려움">
      어려움
    </span>
  )
}

/**
 * 카드 목록의 한 줄. 폴더 상세·카드 찾기·어려운 문장 모음이 함께 쓴다.
 * 암기 완료한 카드는 폴더 색을 거두어 한눈에 구분되게 한다.
 */
export default function CardRow({ card, folder, showFolderName = false, onClick }) {
  const done = card.status === 'completed'
  return (
    <li className={`card-row ${done ? 'is-done' : ''}`}>
      <span
        className="card-row__edge"
        style={done ? undefined : { background: colorVar(folder?.color) }}
        aria-hidden="true"
      />
      <button className="card-row__main" onClick={onClick}>
        <span className="card-row__top">
          <span className="serif card-row__ko">{card.korean_text}</span>
          <AttemptBadge card={card} color={done ? null : folder?.color} />
        </span>
        <span className="card-row__en">{card.english_text}</span>
        {(showFolderName || done || card.flagged) && (
          <span className="card-row__foot">
            {showFolderName && folder && <span className="muted">{folder.name}</span>}
            {card.flagged && <FlagMark />}
            {done && <span className="card-row__done">암기 완료</span>}
          </span>
        )}
      </button>
    </li>
  )
}
