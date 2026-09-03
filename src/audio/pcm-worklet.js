/**
 * 마이크 입력을 16kHz / 모노 / 16bit PCM으로 바꿔 메인 스레드로 보낸다.
 *
 * 왜 직접 이렇게 하는가:
 *  - Azure SDK의 기본 마이크 입력은 일부 안드로이드 기기에서 에러 없이 무음만
 *    전달되는 문제가 보고돼 있다. 스트림을 직접 다루면 그 문제를 피하고,
 *    실제로 소리가 들어오는지 음량으로 확인할 수 있다.
 *  - 같은 PCM을 복사해 두면 "내 녹음 다시 듣기"를 만들 수 있다.
 *    SDK 마이크 입력 방식은 오디오를 돌려주지 않는다.
 *
 * AudioWorkletGlobalScope의 sampleRate 전역값이 기기의 실제 입력 주파수다
 * (안드로이드는 보통 48000). 선형 보간으로 16000까지 내린다.
 */
class PCM16kProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const target = options?.processorOptions?.targetRate || 16000
    this.ratio = sampleRate / target
    this.leftover = new Float32Array(0)
    this.readPos = 0
  }

  process(inputs) {
    const channel = inputs[0]?.[0]
    if (!channel || channel.length === 0) return true

    // 이전 블록에서 남은 샘플과 이어 붙인다 (블록 경계에서 소리가 끊기지 않도록)
    const merged = new Float32Array(this.leftover.length + channel.length)
    merged.set(this.leftover, 0)
    merged.set(channel, this.leftover.length)

    const out = []
    let pos = this.readPos
    while (Math.floor(pos) + 1 < merged.length) {
      const i = Math.floor(pos)
      const frac = pos - i
      out.push(merged[i] * (1 - frac) + merged[i + 1] * frac)
      pos += this.ratio
    }

    const consumed = Math.floor(pos)
    this.leftover = merged.slice(consumed)
    this.readPos = pos - consumed

    if (out.length === 0) return true

    const pcm = new Int16Array(out.length)
    let sumSquares = 0
    let peak = 0
    for (let k = 0; k < out.length; k++) {
      const v = Math.max(-1, Math.min(1, out[k]))
      pcm[k] = v < 0 ? v * 0x8000 : v * 0x7fff
      sumSquares += v * v
      const abs = v < 0 ? -v : v
      if (abs > peak) peak = abs
    }

    this.port.postMessage(
      { pcm: pcm.buffer, rms: Math.sqrt(sumSquares / out.length), peak },
      [pcm.buffer]
    )
    return true
  }
}

registerProcessor('pcm-16k', PCM16kProcessor)
