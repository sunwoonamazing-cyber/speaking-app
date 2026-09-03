/**
 * 타이핑 답변 채점. Azure를 부르지 않으므로 인터넷 없이도 동작한다.
 *
 * 명세:
 *  - 비교 전 정규화: 소문자, 문장부호 제거, 연속 공백 정리
 *  - 점수 = (1 - 단어 편집거리 / 정답 단어 수) × 100, 0 미만은 0
 *  - 대소문자·마침표 차이만으로 감점하지 않는다
 */
export function normalizeSentence(s) {
  return (s || '')
    .replace(/[‘’ʼ]/g, "'") // 둥근 따옴표를 보통 아포스트로피로
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ') // 문장부호 제거 (don't의 ' 는 남긴다)
    .replace(/\s+/g, ' ')
    .trim()
}

export function toWords(s) {
  const n = normalizeSentence(s)
  return n ? n.split(' ') : []
}

/**
 * 단어 단위 정렬. 정답(ref) 기준으로 무엇이 맞고 틀리고 빠졌는지 되짚는다.
 * 반환: { distance, diff: [{ type, word, expected }] }
 *   type: 'ok' 맞음 | 'wrong' 틀린 단어 | 'missing' 빠뜨린 단어 | 'extra' 덧붙인 단어
 */
export function alignWords(answerWords, refWords) {
  const n = answerWords.length
  const m = refWords.length

  // dp[i][j] = answer 앞 i개를 ref 앞 j개로 만들기까지의 편집 횟수
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1))
  for (let i = 0; i <= n; i++) dp[i][0] = i
  for (let j = 0; j <= m; j++) dp[0][j] = j

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = answerWords[i - 1] === refWords[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j - 1] + cost, dp[i - 1][j] + 1, dp[i][j - 1] + 1)
    }
  }

  // 되짚어 올라가며 어떤 편집이었는지 복원한다
  const diff = []
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const cost = answerWords[i - 1] === refWords[j - 1] ? 0 : 1
      if (dp[i][j] === dp[i - 1][j - 1] + cost) {
        diff.push(
          cost === 0
            ? { type: 'ok', word: refWords[j - 1] }
            : { type: 'wrong', word: answerWords[i - 1], expected: refWords[j - 1] }
        )
        i--
        j--
        continue
      }
    }
    if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
      diff.push({ type: 'missing', word: refWords[j - 1] }) // 정답에는 있는데 답에 없음
      j--
      continue
    }
    // 답에만 있는 단어
    diff.push({ type: 'extra', word: answerWords[i - 1] })
    i--
  }

  diff.reverse()
  return { distance: dp[n][m], diff }
}

export function scoreTyping(answer, reference) {
  const refWords = toWords(reference)
  const answerWords = toWords(answer)

  if (refWords.length === 0) {
    return { score: 0, diff: [], distance: 0, empty: true }
  }

  const { distance, diff } = alignWords(answerWords, refWords)
  const score = Math.max(0, Math.round((1 - distance / refWords.length) * 100))
  return { score, diff, distance }
}
