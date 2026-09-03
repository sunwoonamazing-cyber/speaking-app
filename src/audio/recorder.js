import workletUrl from './pcm-worklet.js?url'

export const TARGET_RATE = 16000

/** 마이크 권한 상태를 사람이 읽을 수 있는 형태로 바꾼 오류 */
export class MicError extends Error {
  constructor(kind, message) {
    super(message)
    this.kind = kind // 'denied' | 'notfound' | 'insecure' | 'unsupported' | 'unknown'
  }
}

function toMicError(err) {
  const name = err?.name || ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return new MicError('denied', '마이크 사용이 거부되었습니다.')
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return new MicError('notfound', '마이크를 찾지 못했습니다.')
  }
  return new MicError('unknown', err?.message || '마이크를 열지 못했습니다.')
}

/**
 * 마이크 → 16kHz 모노 16bit PCM.
 * onChunk(Int16Array)로 조각을 흘려보내고, 같은 데이터를 모아 WAV로도 만들 수 있다.
 */
export class MicRecorder {
  constructor({ onChunk, onLevel } = {}) {
    this.onChunk = onChunk
    this.onLevel = onLevel
    this.chunks = []
    this.totalSamples = 0
    this.running = false
  }

  async start() {
    if (!window.isSecureContext) {
      throw new MicError('insecure', '보안 연결(HTTPS)에서만 마이크를 쓸 수 있습니다.')
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new MicError('unsupported', '이 브라우저는 마이크 입력을 지원하지 않습니다.')
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      })
    } catch (err) {
      throw toMicError(err)
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext
    this.ctx = new AudioCtx()
    // 안드로이드·iOS는 사용자 동작 없이는 정지 상태로 시작할 수 있다
    if (this.ctx.state === 'suspended') await this.ctx.resume()

    this.source = this.ctx.createMediaStreamSource(this.stream)

    // 그래프가 destination까지 이어져야 오디오가 실제로 흐른다.
    // 볼륨 0으로 연결해 스피커로 되울리지 않게 한다.
    this.sink = this.ctx.createGain()
    this.sink.gain.value = 0
    this.sink.connect(this.ctx.destination)

    this.chunks = []
    this.totalSamples = 0
    this.running = true

    if (this.ctx.audioWorklet) {
      await this.ctx.audioWorklet.addModule(workletUrl)
      this.node = new AudioWorkletNode(this.ctx, 'pcm-16k', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: { targetRate: TARGET_RATE },
      })
      this.node.port.onmessage = (e) => this.#handle(new Int16Array(e.data.pcm), e.data.rms)
      this.source.connect(this.node)
      this.node.connect(this.sink)
    } else {
      // AudioWorklet이 없는 예전 브라우저용 대비책
      this.#startScriptProcessor()
    }
  }

  #startScriptProcessor() {
    const ratio = this.ctx.sampleRate / TARGET_RATE
    let leftover = new Float32Array(0)
    let readPos = 0

    this.node = this.ctx.createScriptProcessor(4096, 1, 1)
    this.node.onaudioprocess = (e) => {
      if (!this.running) return
      const input = e.inputBuffer.getChannelData(0)
      const merged = new Float32Array(leftover.length + input.length)
      merged.set(leftover, 0)
      merged.set(input, leftover.length)

      const out = []
      let pos = readPos
      while (Math.floor(pos) + 1 < merged.length) {
        const i = Math.floor(pos)
        const frac = pos - i
        out.push(merged[i] * (1 - frac) + merged[i + 1] * frac)
        pos += ratio
      }
      const consumed = Math.floor(pos)
      leftover = merged.slice(consumed)
      readPos = pos - consumed

      if (out.length === 0) return
      const pcm = new Int16Array(out.length)
      let sum = 0
      for (let k = 0; k < out.length; k++) {
        const v = Math.max(-1, Math.min(1, out[k]))
        pcm[k] = v < 0 ? v * 0x8000 : v * 0x7fff
        sum += v * v
      }
      this.#handle(pcm, Math.sqrt(sum / out.length))
    }
    this.source.connect(this.node)
    this.node.connect(this.sink)
  }

  #handle(pcm, rms) {
    if (!this.running) return
    this.chunks.push(pcm)
    this.totalSamples += pcm.length
    this.onChunk?.(pcm)
    this.onLevel?.(rms)
  }

  /** 지금까지 들어온 소리가 사실상 무음인지 (마이크 문제 진단용) */
  isSilent() {
    let peak = 0
    for (const chunk of this.chunks) {
      for (let i = 0; i < chunk.length; i++) {
        const v = chunk[i] < 0 ? -chunk[i] : chunk[i]
        if (v > peak) peak = v
      }
    }
    return peak < 300 // 32768 기준 약 1%
  }

  get seconds() {
    return this.totalSamples / TARGET_RATE
  }

  async stop() {
    this.running = false
    try {
      if (this.node) {
        this.node.disconnect()
        if (this.node.port) this.node.port.onmessage = null
        if (this.node.onaudioprocess) this.node.onaudioprocess = null
      }
      this.source?.disconnect()
      this.sink?.disconnect()
      this.stream?.getTracks().forEach((t) => t.stop())
      if (this.ctx && this.ctx.state !== 'closed') await this.ctx.close()
    } catch {
      // 정리 중 오류는 무시한다 — 이미 녹음은 끝난 상태다
    }
  }

  /** 모아 둔 PCM을 그대로 재생 가능한 WAV로 만든다 */
  toWavBlob() {
    const total = this.totalSamples
    const buffer = new ArrayBuffer(44 + total * 2)
    const view = new DataView(buffer)

    const writeStr = (offset, s) => {
      for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
    }

    writeStr(0, 'RIFF')
    view.setUint32(4, 36 + total * 2, true)
    writeStr(8, 'WAVE')
    writeStr(12, 'fmt ')
    view.setUint32(16, 16, true) // PCM 헤더 길이
    view.setUint16(20, 1, true) // PCM
    view.setUint16(22, 1, true) // 모노
    view.setUint32(24, TARGET_RATE, true)
    view.setUint32(28, TARGET_RATE * 2, true) // 초당 바이트
    view.setUint16(32, 2, true) // 프레임당 바이트
    view.setUint16(34, 16, true) // 비트 깊이
    writeStr(36, 'data')
    view.setUint32(40, total * 2, true)

    let offset = 44
    for (const chunk of this.chunks) {
      for (let i = 0; i < chunk.length; i++, offset += 2) {
        view.setInt16(offset, chunk[i], true)
      }
    }
    return new Blob([buffer], { type: 'audio/wav' })
  }
}
