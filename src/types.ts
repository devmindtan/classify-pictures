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
  status: ProcessingStatus
  error?: string
}

export type ModelProgress = {
  status: string
  progress?: number
  file?: string
}
