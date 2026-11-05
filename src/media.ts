import JSZip from 'jszip'
import { ACCEPTED_IMAGE_EXTENSIONS, ACCEPTED_VIDEO_EXTENSIONS, DEFAULT_ALBUMS, MAX_ARCHIVE_BYTES, MAX_ARCHIVE_ENTRIES, MAX_ENTRY_BYTES } from './catalog'
import type { GpuHealth, InferenceEngine, MediaItem, ModelProgress } from './types'

type Classifier = (input: string, labels: string[]) => Promise<Array<{ label: string; score: number }>>
let classifierPromise: Promise<Classifier> | null = null
const GPU_CLASSIFIER_URL = 'http://127.0.0.1:3911'

type Prediction = { label: string; score: number }

type OpenAnalysis = {
  album: string
  filename: string
  caption: string
  tags: string[]
  objects: string[]
  ocr_text: string
  confidence: number
}

export async function checkGpuClassifier(): Promise<GpuHealth | null> {
  try {
    const response = await fetch(`${GPU_CLASSIFIER_URL}/health`, { signal: AbortSignal.timeout(1800) })
    if (!response.ok) return null
    const health = await response.json() as GpuHealth
    return health.status === 'ok' && health.device === 'cuda' ? health : null
  } catch {
    return null
  }
}

export function extensionOf(name: string) {
  const part = name.toLowerCase().split('.').pop()
  return part && part !== name.toLowerCase() ? part : ''
}

export function isArchive(file: File) {
  return extensionOf(file.name) === 'zip' || file.type === 'application/zip'
}

export function mediaKind(file: File): 'image' | 'video' | null {
  const extension = extensionOf(file.name)
  if (file.type.startsWith('image/') || ACCEPTED_IMAGE_EXTENSIONS.includes(extension)) return 'image'
  if (file.type.startsWith('video/') || ACCEPTED_VIDEO_EXTENSIONS.includes(extension)) return 'video'
  return null
}

function safeArchivePath(path: string) {
  const normalized = path.replaceAll('\\', '/').normalize('NFC')
  const parts = normalized.split('/').filter(Boolean)
  if (normalized.startsWith('/') || parts.some((part) => part === '..' || part === '.')) return null
  return parts.join('/')
}

export async function expandInputFiles(input: File[]): Promise<{ files: File[]; warnings: string[] }> {
  const files: File[] = []
  const warnings: string[] = []

  for (const file of input) {
    if (!isArchive(file)) {
      if (mediaKind(file)) files.push(file)
      else warnings.push(`Bỏ qua “${file.name}” vì định dạng chưa được hỗ trợ.`)
      continue
    }

    if (file.size > MAX_ARCHIVE_BYTES) {
      warnings.push(`“${file.name}” vượt giới hạn 750 MB.`)
      continue
    }

    try {
      const archive = await JSZip.loadAsync(file, { createFolders: false, checkCRC32: true })
      const entries = Object.values(archive.files).filter((entry) => !entry.dir)
      if (entries.length > MAX_ARCHIVE_ENTRIES) throw new Error('Tệp nén chứa quá nhiều mục (tối đa 5.000).')

      for (const entry of entries) {
        const safePath = safeArchivePath(entry.name)
        if (!safePath || safePath.startsWith('__MACOSX/') || safePath.split('/').some((part) => part.startsWith('.'))) continue
        const estimatedSize = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0
        if (estimatedSize > MAX_ENTRY_BYTES) {
          warnings.push(`Bỏ qua “${entry.name}” vì lớn hơn 250 MB sau giải nén.`)
          continue
        }
        const blob = await entry.async('blob')
        if (blob.size > MAX_ENTRY_BYTES) {
          warnings.push(`Bỏ qua “${entry.name}” vì lớn hơn 250 MB sau giải nén.`)
          continue
        }
        const entryName = safePath.split('/').pop() ?? 'media'
        const extracted = new File([blob], entryName, { type: blob.type, lastModified: entry.date.getTime() })
        if (mediaKind(extracted)) {
          Object.defineProperty(extracted, 'webkitRelativePath', { value: safePath, configurable: true })
          files.push(extracted)
        }
      }
    } catch (error) {
      warnings.push(`Không thể đọc “${file.name}”: ${error instanceof Error ? error.message : 'tệp nén không hợp lệ'}`)
    }
  }

  return { files, warnings }
}

export function makeMediaItem(file: File): MediaItem | null {
  const kind = mediaKind(file)
  if (!kind) return null
  return {
    id: crypto.randomUUID(),
    file,
    originalName: file.name,
    outputName: file.name,
    sourcePath: file.webkitRelativePath || file.name,
    kind,
    previewUrl: URL.createObjectURL(file),
    albumId: 'other',
    confidence: null,
    tags: [],
    status: 'ready',
  }
}

function filenameGuess(name: string) {
  const normalized = name.toLowerCase().replaceAll(/[_\-.]+/g, ' ')
  return DEFAULT_ALBUMS.find((album) => album.id !== 'other' && album.keywords.some((keyword) => normalized.includes(keyword)))?.id ?? 'other'
}

async function getClassifier(onProgress: (progress: ModelProgress) => void): Promise<Classifier> {
  if (!classifierPromise) {
    classifierPromise = import('@huggingface/transformers').then(async ({ env, pipeline }) => {
      env.allowRemoteModels = true
      env.useBrowserCache = true
      return await pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32', {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: onProgress,
      }) as unknown as Classifier
    })
  }
  return classifierPromise
}

function waitFor(target: HTMLMediaElement, event: string) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Không đọc được khung hình video.')), 12_000)
    target.addEventListener(event, () => { window.clearTimeout(timeout); resolve() }, { once: true })
    target.addEventListener('error', () => { window.clearTimeout(timeout); reject(new Error('Trình duyệt không hỗ trợ video này.')) }, { once: true })
  })
}

async function videoFrameBlob(file: File) {
  const video = document.createElement('video')
  video.muted = true
  video.preload = 'metadata'
  const sourceUrl = URL.createObjectURL(file)
  video.src = sourceUrl
  try {
    await waitFor(video, 'loadedmetadata')
    video.currentTime = Number.isFinite(video.duration) ? Math.min(Math.max(video.duration * 0.25, 0.1), 10) : 0.1
    await waitFor(video, 'seeked')
    const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Không trích xuất được khung hình.')), 'image/jpeg', 0.86))
    return blob
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(sourceUrl)
  }
}

async function imageBlobForGpu(item: MediaItem) {
  if (item.kind === 'video') return videoFrameBlob(item.file)
  try {
    const bitmap = await createImageBitmap(item.file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Không chuyển đổi được ảnh.')), 'image/jpeg', 0.9))
  } catch {
    if (item.file.size <= 25 * 1024 * 1024) return item.file
    throw new Error('Ảnh vượt giới hạn 25 MB và trình duyệt không thể thu nhỏ.')
  }
}

async function classifyWithGpu(image: Blob): Promise<OpenAnalysis> {
  const response = await fetch(`${GPU_CLASSIFIER_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': image.type || 'application/octet-stream' },
    body: image,
    signal: AbortSignal.timeout(130_000),
  })
  if (!response.ok) throw new Error(`GPU vision trả về HTTP ${response.status}.`)
  const result = await response.json() as OpenAnalysis
  if (!result.album || !result.filename || !Array.isArray(result.tags)) throw new Error('GPU vision không trả về kết quả hợp lệ.')
  return result
}

function resolvePrediction(predictions: Prediction[], fallback: string, engine: InferenceEngine) {
  const candidateAlbums = DEFAULT_ALBUMS.filter((album) => album.id !== 'other')
  const best = predictions[0]
  const album = candidateAlbums.find((entry) => entry.prompt === best?.label)
  if (!best || !album || best.score < 0.19) {
    return { albumId: fallback, confidence: best?.score ?? null, tags: predictions.slice(0, 3).map((value) => value.label), engine }
  }
  return { albumId: album.id, confidence: best.score, tags: predictions.slice(0, 3).map((value) => value.label), engine }
}

export async function classifyItem(item: MediaItem, onProgress: (progress: ModelProgress) => void, gpuAvailable = false) {
  const fallback = filenameGuess(item.originalName)
  const candidateLabels = DEFAULT_ALBUMS.filter((album) => album.id !== 'other').map((album) => album.prompt)
  let frameBlob: Blob | null = null
  if (gpuAvailable) {
    try {
      frameBlob = await imageBlobForGpu(item)
      const result = await classifyWithGpu(frameBlob)
      return {
        albumId: '',
        albumName: result.album,
        filenameStem: result.filename,
        confidence: result.confidence,
        caption: result.caption,
        tags: result.tags,
        objects: result.objects,
        ocrText: result.ocr_text,
        engine: 'gpu' as const,
      }
    } catch {
      // The private GPU may have gone offline; continue with the browser model.
    }
  }
  let analysisUrl = item.previewUrl
  let temporaryFrame = false
  try {
    if (item.kind === 'video') {
      frameBlob ??= await videoFrameBlob(item.file)
      analysisUrl = URL.createObjectURL(frameBlob)
      temporaryFrame = true
    }
    const classifier = await getClassifier(onProgress)
    const predictions = await classifier(analysisUrl, candidateLabels)
    return resolvePrediction(predictions, fallback, 'browser')
  } catch (error) {
    return { albumId: fallback, confidence: null, tags: [], engine: 'browser' as const, error: error instanceof Error ? error.message : 'Không thể phân tích tệp.' }
  } finally {
    if (temporaryFrame) URL.revokeObjectURL(analysisUrl)
  }
}

export function suggestedName(item: MediaItem, albumName: string, index: number, filenameStem?: string) {
  const extension = extensionOf(item.originalName) || (item.kind === 'image' ? 'jpg' : 'mp4')
  const date = new Date(item.file.lastModified || Date.now())
  const datePart = Number.isNaN(date.getTime()) ? 'khong-ro-ngay' : date.toISOString().slice(0, 10)
  const description = sanitizeSegment(filenameStem || albumName).toLowerCase().replaceAll(/\s+/g, '-') || 'khac'
  return `${description}_${datePart}_${String(index + 1).padStart(3, '0')}.${extension}`
}

export function sanitizeSegment(value: string) {
  return value.normalize('NFC').replaceAll(/[<>:"/\\|?*\u0000-\u001F]/g, '').replaceAll(/\s+/g, ' ').trim().slice(0, 120)
}
