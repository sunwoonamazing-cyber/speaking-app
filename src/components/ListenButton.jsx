import { useEffect, useRef, useState } from 'react'
import { getSpeech } from '../speech/tts.js'

/**
 * 정답 문장의 원어민 발음 듣기.
 * 한 번 들은 문장은 기기에 저장돼 다음부터는 인터넷 없이도 재생된다.
 */
export default function ListenButton({ text, settings, full = false }) {
  const [state, setState] = useState('idle') // idle | loading | playing
  const [error, setError] = useState(null)
  const audioRef = useRef(null)
  const urlRef = useRef(null)

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [])

  // 카드가 바뀌면 앞 카드의 소리는 멈춘다
  useEffect(() => {
    audioRef.current?.pause()
    setState('idle')
    setError(null)
  }, [text])

  async function play() {
    if (state === 'playing') {
      audioRef.current?.pause()
      setState('idle')
      return
    }

    setError(null)
    setState('loading')
    try {
      const blob = await getSpeech(text, {
        accent: settings.accent,
        key: settings.azure_key,
        region: settings.azure_region,
      })

      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = URL.createObjectURL(blob)

      const audio = new Audio(urlRef.current)
      audioRef.current = audio
      audio.onended = () => setState('idle')
      audio.onerror = () => {
        setError('소리를 재생하지 못했습니다.')
        setState('idle')
      }
      await audio.play()
      setState('playing')
    } catch (err) {
      setError(err.message || '발음을 가져오지 못했습니다.')
      setState('idle')
    }
  }

  return (
    <>
      <button
        className={`btn ${full ? 'btn--full' : ''}`}
        onClick={play}
        disabled={state === 'loading' || !text?.trim()}
      >
        {state === 'loading' ? '가져오는 중' : state === 'playing' ? '멈추기' : '정답 발음 듣기'}
      </button>
      {error && <p className="notice notice--bad">{error}</p>}
    </>
  )
}
