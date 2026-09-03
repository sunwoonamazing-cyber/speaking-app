import { addDays, daysBetween, todayStr } from './dates.js'

/**
 * 종합 점수를 SM-2 등급(0~5)으로 바꾼다.
 *
 * | 종합 점수 | 등급 |
 * |---|---|
 * | 90 이상 | 5 |
 * | 80~89 | 4 |
 * | 70~79 | 3 |
 * | 60~69 | 2 (실패) |
 * | 60 미만 | 1 (실패) |
 */
export function scoreToGrade(score) {
  if (!Number.isFinite(score)) return null
  if (score >= 90) return 5
  if (score >= 80) return 4
  if (score >= 70) return 3
  if (score >= 60) return 2
  return 1
}

export function isPass(grade) {
  return Number.isFinite(grade) && grade >= 3
}

export function gradeLabel(grade) {
  switch (grade) {
    case 5:
      return '아주 잘함'
    case 4:
      return '잘함'
    case 3:
      return '통과'
    case 2:
    case 1:
      return '다시 볼 문장'
    default:
      return ''
  }
}

/** 수동으로 등급을 덮어쓸 때 쓰는 값 */
export const MANUAL_AGAIN = 2 // 다시 볼래요 — 실패로 보고 주기를 초기화
export const MANUAL_GOT_IT = 4 // 알겠어요 — 통과

export const MIN_EASE = 1.3
export const DEFAULT_EASE = 2.5

/**
 * SM-2 한 걸음. 카드의 현재 상태와 등급을 받아 바뀔 값만 돌려준다.
 * 등급 3 미만이면 repetitions를 0으로, interval을 1일로 되돌린다.
 */
export function applySm2(card, grade, today = todayStr()) {
  let interval = Number.isFinite(card.interval) ? card.interval : 0
  let repetitions = Number.isFinite(card.repetitions) ? card.repetitions : 0
  let ease = Number.isFinite(card.ease_factor) ? card.ease_factor : DEFAULT_EASE

  if (isPass(grade)) {
    if (repetitions === 0) interval = 1
    else if (repetitions === 1) interval = 6
    else interval = Math.max(1, Math.round(interval * ease))
    repetitions += 1
  } else {
    repetitions = 0
    interval = 1
  }

  // 원래 SM-2의 난이도 계수 갱신식. 아래로는 1.3까지만 내려간다.
  ease = Math.max(MIN_EASE, ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)))

  return {
    interval,
    repetitions,
    ease_factor: Math.round(ease * 1000) / 1000,
    review_due_date: addDays(today, interval),
    // 한 번이라도 본 카드는 학습 중으로 넘어간다 (완료 처리한 카드는 그대로 둔다)
    status: card.status === 'completed' ? 'completed' : 'learning',
  }
}

/**
 * 복습 카드 정렬용 우선순위 점수. 높을수록 먼저 나온다.
 *
 * | 항목 | 계산 | 가중치 |
 * |---|---|---|
 * | 밀린 정도 | min(오늘 - 복습예정일, 30) / 30 × 100 | 0.4 |
 * | 틀린 비율 | fail_count / max(attempt_count, 1) × 100 | 0.3 |
 * | 최근 점수 낮음 | 100 - last_avg_score (기록 없으면 100) | 0.2 |
 * | 복습 부족 | max(0, 5 - attempt_count) / 5 × 100 | 0.1 |
 *
 * 플래그(어려움)된 카드는 +15.
 */
export function priorityScore(card, today = todayStr()) {
  const overdueDays = card.review_due_date
    ? Math.min(Math.max(daysBetween(today, card.review_due_date), 0), 30)
    : 0
  const overdue = (overdueDays / 30) * 100

  const attempts = card.attempt_count || 0
  const failRate = ((card.fail_count || 0) / Math.max(attempts, 1)) * 100

  const lowScore = Number.isFinite(card.last_avg_score) ? 100 - card.last_avg_score : 100
  const fewReviews = (Math.max(0, 5 - attempts) / 5) * 100

  let score = overdue * 0.4 + failRate * 0.3 + lowScore * 0.2 + fewReviews * 0.1
  if (card.flagged) score += 15
  return score
}

/** 사람이 읽을 다음 복습 시점 */
export function describeDue(dueDate, today = todayStr()) {
  if (!dueDate) return ''
  const days = daysBetween(dueDate, today)
  if (days <= 0) return '오늘 다시'
  if (days === 1) return '내일 다시'
  return `${days}일 뒤에 다시`
}
