import { getDB } from '../db.js'
import { ACCENTS } from '../settings.js'

let sdkPromise = null
function loadSdk() {
  if (!sdkPromise) sdkPromise = import('microsoft-cognitiveservices-speech-sdk')
  return sdkPromise
}

export class TtsError extends Error {
  constructor(kind, message) {
    super(message)
    this.kind = kind // 'nokey' | 'offline' | 'auth' | 'error'
  }
}

export function voiceFor(accent) {
  const found = ACCENTS.find((a) => a.value === accent)
  return (found || ACCENTS[0]).voice
}

/** 같은 문장·같은 목소리면 같은 열쇠 — 두 번 다시 만들지 않는다 */
function cacheKey(text, voice) {
  return `${voice}|${text.trim()}`
}

async function readCache(key) {
  try {
    const db = await getDB()
    const row = await db.get('tts_cache', key)
    return row?.blob || null
  } catch {
    return null
  }
}

async function writeCache(key, blob) {
  try {
    const db = await getDB()
    await db.put('tts_cache', { key, blob, created_at: new Date().toISOString() })
  } catch {
    // 저장 공간이 없으면 캐시만 못 할 뿐, 재생은 그대로 된다
  }
}

/** 캐시에 이미 있는지 (인터넷 없이도 들을 수 있는지 화면에 알려주기 위함) */
export async function isCached(text, accent) {
  return Boolean(await readCache(cacheKey(text, voiceFor(accent))))
}

/**
 * 정답 문장의 원어민 발음을 가져온다.
 * 캐시에 있으면 인터넷 없이도 바로 돌려주고, 없으면 Azure에서 만들어 캐시에 넣는다.
 */
export async function getSpeech(text, { accent, key, region }) {
  const voice = voiceFor(accent)
  const ck = cacheKey(text, voice)

  const cached = await readCache(ck)
  if (cached) return cached

  if (!key || !region) {
    throw new TtsError('nokey', '설정에서 Azure 키와 지역을 먼저 넣어 주세요.')
  }
  if (!navigator.onLine) {
    throw new TtsError(
      'offline',
      '인터넷이 없어 새 발음을 만들 수 없습니다. 한 번 들었던 문장은 인터넷 없이도 들립니다.'
    )
  }

  const SpeechSDK = await loadSdk()
  const config = SpeechSDK.SpeechConfig.fromSubscription(key, region)
  config.speechSynthesisVoiceName = voice
  // mp3로 받아야 캐시 용량이 작다 (WAV로 받으면 몇 배가 된다)
  config.speechSynthesisOutputFormat = SpeechSDK.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3

  // audioConfig에 null을 주면 스피커로 바로 흘리지 않고 데이터만 돌려준다.
  // 우리가 직접 캐시에 넣고 재생을 다루기 위해 필요하다.
  const synth = new SpeechSDK.SpeechSynthesizer(config, null)

  const audio = await new Promise((resolve, reject) => {
    synth.speakTextAsync(
      text,
      (result) => {
        try {
          if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
            resolve(result.audioData)
          } else {
            const detail = result.errorDetails || ''
            reject(
              new TtsError(
                /401|403|Forbidden|Unauthorized|subscription/i.test(detail) ? 'auth' : 'error',
                /401|403|Forbidden|Unauthorized|subscription/i.test(detail)
                  ? 'Azure 키나 지역이 맞지 않습니다.'
                  : detail || '발음을 만들지 못했습니다.'
              )
            )
          }
        } finally {
          synth.close()
        }
      },
      (err) => {
        synth.close()
        reject(new TtsError('error', String(err)))
      }
    )
  })

  const blob = new Blob([audio], { type: 'audio/mpeg' })
  await writeCache(ck, blob)
  return blob
}
