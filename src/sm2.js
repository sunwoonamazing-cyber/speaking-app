/**
 * 종합 점수를 SM-2 등급(0~5)으로 바꾼다.
 * 실제 일정 계산(interval / repetitions / ease_factor)은 6단계에서 붙는다.
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
