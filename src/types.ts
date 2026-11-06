export type MediaKind = 'image' | 'video'
export type ProcessingStatus = 'ready' | 'processing' | 'done' | 'error'

export type AlbumDefinition = {
  id: string
  name: string
  prompt: string
  color: string
  keywords: string[]
}

export type MediaItem = {
  id: string
  file: File
  originalName: string
  outputName: string
  sourcePath: string
  kind: MediaKind
  previewUrl: string
  albumId: string
  confidence: number | null
  tags: string[]
  caption?: string
  objects?: string[]
  ocrText?: string
  evidence?: string[]
  classificationReason?: string
  reviewRequired?: boolean
  reviewReasons?: string[]
  scoredTags?: Array<{ name: string; score: number; rawScore?: number }>
  classificationMethod?: string
  visualFingerprint?: string
  status: ProcessingStatus
  error?: string
}

export type ModelProgress = {
  status: string
  progress?: number
  file?: string
}

export type GpuHealth = {
  status: 'ok' | 'starting'
  model: string
  device: 'cuda'
  gpu: string
  capabilities?: string[]
  tag_model?: string
  method?: string
}

export type InferenceEngine = 'gpu' | 'browser'
