import { TARGET_RATE } from '../audio/recorder.js'

/**
 * Azure SDK는 400KB가 넘어 첫 실행을 느리게 만든다.
 * 말하기 채점을 실제로 누를 때 처음 불러온다 — 타이핑 모드만 쓰는 날에는 아예 안 받는다.
 */
let sdkPromise = null
function loadSdk() {
  if (!sdkPromise) sdkPromise = import('microsoft-cognitiveservices-speech-sdk')
  return sdkPromise
}

/** 16kHz / 16bit / 모노 PCM을 밀어 넣을 스트림 */
export async function createPushStream() {
  const SpeechSDK = await loadSdk()
  const format = SpeechSDK.AudioStreamFormat.getWaveFormatPCM(TARGET_RATE, 16, 1)
  return SpeechSDK.AudioInputStream.createPushStream(format)
}

/**
 * 발음 평가를 시작한다. 녹음이 시작될 때 함께 호출하고,
 * 사용자가 멈추면 pushStream.close()를 부르면 결과가 돌아온다.
 *
 * 돌아오는 값
 *  - { ok: true, scores, recognizedText, words }
 *  - { ok: false, reason: 'nomatch' }        인식 실패 — 점수로 기록하지 말 것
 *  - { ok: false, reason: 'auth' | 'network' | 'error', message }
 */
export async function startAssessment({ key, region, language, referenceText, pushStream }) {
  const SpeechSDK = await loadSdk()
  const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(key, region)
  speechConfig.speechRecognitionLanguage = language

  // 말을 시작하기까지 시간이 걸려도 성급하게 끝내지 않도록 넉넉히 준다
  speechConfig.setProperty(
    SpeechSDK.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs,
    '10000'
  )

  const paConfig = new SpeechSDK.PronunciationAssessmentConfig(
    referenceText,
    SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
    SpeechSDK.PronunciationAssessmentGranularity.Phoneme,
    true // EnableMiscue — 빠뜨리거나 덧붙인 단어를 잡아낸다
  )
  paConfig.enableProsodyAssessment = true

  const audioConfig = SpeechSDK.AudioConfig.fromStreamInput(pushStream)
  const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig)
  paConfig.applyTo(recognizer)

  const promise = new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      try {
        recognizer.close()
      } catch {
        // 이미 닫혔으면 무시
      }
      resolve(value)
    }

    recognizer.recognizeOnceAsync(
      (result) => finish(interpret(SpeechSDK, result)),
      (err) => finish({ ok: false, reason: 'error', message: String(err) })
    )
  })

  return { recognizer, promise }
}

function interpret(SpeechSDK, result) {
  const R = SpeechSDK.ResultReason

  if (result.reason === R.NoMatch) {
    return { ok: false, reason: 'nomatch' }
  }

  if (result.reason === R.Canceled) {
    const details = SpeechSDK.CancellationDetails.fromResult(result)
    const text = details.errorDetails || ''
    if (
      details.reason === SpeechSDK.CancellationReason.Error &&
      /401|403|Forbidden|Unauthorized|subscription/i.test(text)
    ) {
      return {
        ok: false,
        reason: 'auth',
        message: 'Azure 키나 지역이 맞지 않습니다. 설정에서 다시 확인해 주세요.',
      }
    }
    if (/websocket|connection|network|1006|getaddrinfo/i.test(text)) {
      return {
        ok: false,
        reason: 'network',
        message: 'Azure에 연결하지 못했습니다. 인터넷 상태를 확인해 주세요.',
      }
    }
    return { ok: false, reason: 'error', message: text || '채점하지 못했습니다.' }
  }

  if (result.reason !== R.RecognizedSpeech || !result.text) {
    return { ok: false, reason: 'nomatch' }
  }

  const pa = SpeechSDK.PronunciationAssessmentResult.fromResult(result)
  const words = extractWords(SpeechSDK, result, pa)

  // Azure는 주변 소음을 문장으로 '인식됨' 처리해 돌려주기도 한다.
  // EnableMiscue를 켜 두면 아무 말도 안 했을 때 정답 단어가 전부 Omission으로 온다 —
  // 그렇게 실제로 말한 단어가 하나도 없으면 0점 오답이 아니라 인식 실패로 다룬다.
  if (words.length > 0 && words.every((w) => w.errorType === 'Omission')) {
    return { ok: false, reason: 'nomatch' }
  }

  // 운율 점수는 계정·리전에 따라 안 올 수 있다. 없으면 화면에서 숨긴다.
  const prosody = Number.isFinite(pa.prosodyScore) && pa.prosodyScore > 0 ? pa.prosodyScore : null

  const scores = {
    accuracy: round(pa.accuracyScore),
    fluency: round(pa.fluencyScore),
    completeness: round(pa.completenessScore),
    prosody: prosody === null ? null : round(prosody),
  }

  return {
    ok: true,
    scores,
    overall: overallScore(scores),
    recognizedText: result.text,
    words,
  }
}

function round(n) {
  return Number.isFinite(n) ? Math.round(n) : null
}

/** 종합 점수 = 정확도·유창성·완성도의 평균 (운율이 있으면 함께 평균) */
export function overallScore(scores) {
  const parts = [scores.accuracy, scores.fluency, scores.completeness, scores.prosody].filter(
    (n) => Number.isFinite(n)
  )
  if (parts.length === 0) return null
  return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length)
}

/**
 * 단어별 결과. ErrorType이 어느 단어를 빠뜨렸는지/잘못 말했는지 알려준다.
 * SDK 버전에 따라 detailResult가 없을 수 있어 원본 JSON도 함께 본다.
 */
function extractWords(SpeechSDK, result, pa) {
  let raw = pa?.detailResult?.Words
  if (!Array.isArray(raw)) {
    try {
      const json = JSON.parse(
        result.properties.getProperty(SpeechSDK.PropertyId.SpeechServiceResponse_JsonResult)
      )
      raw = json?.NBest?.[0]?.Words
    } catch {
      raw = null
    }
  }
  if (!Array.isArray(raw)) return []

  return raw.map((w) => ({
    word: w.Word,
    accuracy: round(w.PronunciationAssessment?.AccuracyScore),
    errorType: w.PronunciationAssessment?.ErrorType || 'None',
  }))
}
