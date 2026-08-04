import { newSession, remove, rembgConfig } from '@bunnio/rembg-web'
import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'

export type ImageQuality = 'fast' | 'balanced' | 'best'
export type VideoBackground = 'transparent' | 'white' | 'black' | 'green' | 'custom'

export interface VideoRenderOptions {
  background: VideoBackground
  customColor: string
  feather: number
  onProgress: (value: number) => void
  signal: AbortSignal
}

const MEDIAPIPE_VERSION = '0.10.35'
const MEDIAPIPE_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`
const SELFIE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite'

const IMAGE_MODELS = {
  fast: 'u2netp',
  balanced: 'u2net',
  best: 'isnet-general-use',
} as const

rembgConfig.setCustomModelPath(
  'u2netp',
  'https://huggingface.co/BritishWerewolf/U-2-Netp/resolve/main/onnx/model.onnx',
)
rembgConfig.setCustomModelPath(
  'u2net',
  'https://huggingface.co/BritishWerewolf/U-2-Net/resolve/main/onnx/model.onnx',
)
rembgConfig.setCustomModelPath(
  'isnet-general-use',
  'https://huggingface.co/onnx-community/ISNet-ONNX/resolve/main/onnx/model_fp16.onnx',
)

const imageSessions = new Map<ImageQuality, ReturnType<typeof newSession>>()

export async function cutOutImage(
  file: File,
  quality: ImageQuality,
  onProgress: (value: number) => void,
) {
  let sessionPromise = imageSessions.get(quality)
  if (!sessionPromise) {
    sessionPromise = newSession(IMAGE_MODELS[quality], undefined, {
      numThreads: crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1,
      onProgress: ({ progress }) => onProgress(Math.min(0.8, progress * 0.008)),
    })
    imageSessions.set(quality, sessionPromise)
  }
  let session
  try {
    session = await sessionPromise
  } catch (error) {
    imageSessions.delete(quality)
    throw error
  }
  onProgress(0.84)
  return remove(file, {
    session,
    postProcessMask: quality !== 'fast',
    onProgress: ({ progress }) => {
      onProgress(Math.min(0.98, 0.84 + progress * 0.0014))
    },
  })
}

export async function compositeImage(
  foregroundUrl: string,
  background: VideoBackground,
  customColor: string,
) {
  const image = await loadImage(foregroundUrl)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable in this browser.')
  const color = backgroundColor(background, customColor)
  if (color) {
    context.fillStyle = color
    context.fillRect(0, 0, canvas.width, canvas.height)
  }
  context.drawImage(image, 0, 0)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode PNG.'))), 'image/png')
  })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export function canRenderVideo() {
  return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function'
}

export async function renderVideo(
  video: HTMLVideoElement,
  outputCanvas: HTMLCanvasElement,
  options: VideoRenderOptions,
) {
  if (!canRenderVideo()) throw new Error('Video export is not supported in this browser.')

  const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight))
  const width = evenSize(video.videoWidth * scale)
  const height = evenSize(video.videoHeight * scale)
  outputCanvas.width = width
  outputCanvas.height = height

  const foreground = document.createElement('canvas')
  foreground.width = width
  foreground.height = height
  const maskCanvas = document.createElement('canvas')
  const outputContext = outputCanvas.getContext('2d', { alpha: true })
  const foregroundContext = foreground.getContext('2d', { alpha: true })
  const maskContext = maskCanvas.getContext('2d', { alpha: true })
  if (!outputContext || !foregroundContext || !maskContext) throw new Error('Canvas is unavailable in this browser.')

  let segmenter: ImageSegmenter | null = null
  try {
    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM)
    const commonOptions = {
      baseOptions: { modelAssetPath: SELFIE_MODEL, delegate: 'GPU' as const },
      runningMode: 'VIDEO' as const,
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    }
    try {
      segmenter = await ImageSegmenter.createFromOptions(vision, commonOptions)
    } catch {
      segmenter = await ImageSegmenter.createFromOptions(vision, {
        ...commonOptions,
        baseOptions: { ...commonOptions.baseOptions, delegate: 'CPU' as const },
      })
    }

    await seekVideo(video, 0)
    video.muted = true
    video.playbackRate = 1

    const canvasStream = outputCanvas.captureStream(30)
    const sourceStream = getCaptureStream(video)
    sourceStream?.getAudioTracks().forEach((track) => canvasStream.addTrack(track))
    const mimeType = supportedVideoMimeType()
    const recorder = new MediaRecorder(canvasStream, {
      mimeType,
      videoBitsPerSecond: Math.max(4_000_000, width * height * 7),
    })
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data)
    }

    const blobPromise = new Promise<Blob>((resolve, reject) => {
      recorder.onerror = () => reject(new Error('The browser could not encode this video.'))
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType.split(';')[0] }))
    })

    let previousMask: Float32Array | null = null
    let lastTimestamp = -1

    const drawFrame = () => {
      const timestamp = Math.max(lastTimestamp + 1, Math.round(video.currentTime * 1000))
      lastTimestamp = timestamp
      segmenter?.segmentForVideo(video, timestamp, (result) => {
        const mask = result.confidenceMasks?.[0]
        if (!mask) return
        const values = mask.getAsFloat32Array()
        if (maskCanvas.width !== mask.width || maskCanvas.height !== mask.height) {
          maskCanvas.width = mask.width
          maskCanvas.height = mask.height
          previousMask = null
        }
        const pixels = maskContext.createImageData(mask.width, mask.height)
        const feather = 0.03 + options.feather * 0.2
        const low = 0.52 - feather
        const high = 0.52 + feather
        for (let index = 0; index < values.length; index += 1) {
          const stabilized = previousMask ? values[index] * 0.78 + previousMask[index] * 0.22 : values[index]
          const alpha = smoothstep(low, high, stabilized)
          const offset = index * 4
          pixels.data[offset] = 255
          pixels.data[offset + 1] = 255
          pixels.data[offset + 2] = 255
          pixels.data[offset + 3] = Math.round(alpha * 255)
        }
        previousMask = new Float32Array(values)
        maskContext.putImageData(pixels, 0, 0)

        foregroundContext.clearRect(0, 0, width, height)
        foregroundContext.globalCompositeOperation = 'source-over'
        foregroundContext.drawImage(video, 0, 0, width, height)
        foregroundContext.globalCompositeOperation = 'destination-in'
        foregroundContext.drawImage(maskCanvas, 0, 0, width, height)
        foregroundContext.globalCompositeOperation = 'source-over'

        outputContext.clearRect(0, 0, width, height)
        const color = backgroundColor(options.background, options.customColor)
        if (color) {
          outputContext.fillStyle = color
          outputContext.fillRect(0, 0, width, height)
        }
        outputContext.drawImage(foreground, 0, 0)
      })
      options.onProgress(Math.min(0.99, video.currentTime / Math.max(video.duration, 0.1)))
    }

    const done = new Promise<void>((resolve, reject) => {
      let frameRequest = 0
      let rafRequest = 0
      const stopScheduling = () => {
        if (frameRequest && 'cancelVideoFrameCallback' in video) {
          video.cancelVideoFrameCallback(frameRequest)
        }
        if (rafRequest) cancelAnimationFrame(rafRequest)
      }
      const finish = () => {
        stopScheduling()
        resolve()
      }
      const fail = () => {
        stopScheduling()
        reject(new DOMException('Cancelled', 'AbortError'))
      }
      const schedule = () => {
        if (options.signal.aborted) return fail()
        if (video.ended || video.currentTime >= video.duration) return finish()
        if ('requestVideoFrameCallback' in video) {
          frameRequest = video.requestVideoFrameCallback(() => {
            drawFrame()
            schedule()
          })
        } else {
          rafRequest = requestAnimationFrame(() => {
            drawFrame()
            schedule()
          })
        }
      }
      options.signal.addEventListener('abort', fail, { once: true })
      video.addEventListener('ended', finish, { once: true })
      drawFrame()
      schedule()
    })

    recorder.start(1_000)
    await video.play()
    try {
      await done
      options.onProgress(1)
    } finally {
      video.pause()
      if (recorder.state !== 'inactive') recorder.stop()
      canvasStream.getTracks().forEach((track) => track.stop())
    }
    return await blobPromise
  } finally {
    segmenter?.close()
  }
}

function supportedVideoMimeType() {
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9', 'video/webm']
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? 'video/webm'
}

function getCaptureStream(video: HTMLVideoElement) {
  const candidate = video as HTMLVideoElement & {
    captureStream?: () => MediaStream
    mozCaptureStream?: () => MediaStream
  }
  return candidate.captureStream?.() ?? candidate.mozCaptureStream?.()
}

function backgroundColor(background: VideoBackground, customColor: string) {
  if (background === 'transparent') return null
  if (background === 'white') return '#ffffff'
  if (background === 'black') return '#000000'
  if (background === 'green') return '#00ff00'
  return customColor
}

function smoothstep(low: number, high: number, value: number) {
  const normalized = Math.max(0, Math.min(1, (value - low) / (high - low)))
  return normalized * normalized * (3 - 2 * normalized)
}

function evenSize(value: number) {
  return Math.max(2, Math.round(value / 2) * 2)
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not read the image.'))
    image.src = url
  })
}

function seekVideo(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve) => {
    if (Math.abs(video.currentTime - time) < 0.01) return resolve()
    video.addEventListener('seeked', () => resolve(), { once: true })
    video.currentTime = time
  })
}
