import { useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import { Archive, Check, ChevronDown, CircleHelp, Cpu, Download, FileArchive, FolderInput, Image as ImageIcon, ListFilter, LoaderCircle, LockKeyhole, Pencil, Play, Search, ShieldCheck, Sparkles, Trash2, Upload, Video, X } from 'lucide-react'
import { DEFAULT_ALBUMS } from './catalog'
import { checkGpuClassifier, classifyItem, createClassificationMemory, expandInputFiles, makeMediaItem, sanitizeSegment, suggestedName } from './media'
import type { AlbumDefinition, GpuHealth, InferenceEngine, MediaItem, ModelProgress } from './types'

type Filter = 'all' | 'image' | 'video'

const DYNAMIC_COLORS = ['#4f8f78', '#5d79b5', '#a66d9f', '#b5784e', '#718c47', '#487f98', '#9b6d4b', '#7969a8']

function dynamicAlbum(name: string, existing: AlbumDefinition[]) {
  const cleanName = sanitizeSegment(name) || 'Chưa xác định'
  const match = existing.find((album) => album.name.localeCompare(cleanName, 'vi', { sensitivity: 'base' }) === 0)
  if (match) return match
  let hash = 0
  for (const char of cleanName) hash = ((hash * 31) + char.charCodeAt(0)) >>> 0
  const slug = cleanName.normalize('NFD').replaceAll(/[\u0300-\u036f]/g, '').toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '') || `album-${hash}`
  return { id: `ai-${slug}-${hash.toString(36).slice(0, 4)}`, name: cleanName, prompt: '', keywords: [], color: DYNAMIC_COLORS[hash % DYNAMIC_COLORS.length] }
}

export default function App() {
  const [items, setItems] = useState<MediaItem[]>([])
  const [albums, setAlbums] = useState<AlbumDefinition[]>(DEFAULT_ALBUMS)
  const [isDragging, setIsDragging] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [modelProgress, setModelProgress] = useState<ModelProgress | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [activeAlbum, setActiveAlbum] = useState('all')
  const [showHelp, setShowHelp] = useState(false)
  const [gpuHealth, setGpuHealth] = useState<GpuHealth | null>(null)
  const [lastEngine, setLastEngine] = useState<InferenceEngine | null>(null)
  const itemsRef = useRef<MediaItem[]>([])
  const albumsRef = useRef<AlbumDefinition[]>(DEFAULT_ALBUMS)
  const fileInput = useRef<HTMLInputElement>(null)
  const archiveInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)

  useEffect(() => { itemsRef.current = items }, [items])
  useEffect(() => { albumsRef.current = albums }, [albums])
  useEffect(() => () => itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl)), [])
  useEffect(() => {
    let active = true
    const refresh = async () => {
      const health = await checkGpuClassifier()
      if (active) setGpuHealth(health)
    }
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 5000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  const doneCount = items.filter((item) => item.status === 'done').length
  const albumCounts = useMemo(() => Object.fromEntries(albums.map((album) => [album.id, items.filter((item) => item.albumId === album.id).length])), [albums, items])
  const visibleItems = useMemo(() => items.filter((item) => {
    const matchesType = filter === 'all' || item.kind === filter
    const matchesAlbum = activeAlbum === 'all' || item.albumId === activeAlbum
    const haystack = `${item.originalName} ${item.outputName} ${item.caption ?? ''} ${item.tags.join(' ')} ${item.ocrText ?? ''}`.toLowerCase()
    return matchesType && matchesAlbum && haystack.includes(query.trim().toLowerCase())
  }), [activeAlbum, filter, items, query])

  async function importFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList)
    if (!incoming.length) return
    setIsImporting(true)
    setWarnings([])
    try {
      const expanded = await expandInputFiles(incoming)
      const next = expanded.files.map(makeMediaItem).filter((item): item is MediaItem => item !== null)
      setWarnings(expanded.warnings)
      setItems((current) => [...current, ...next])
    } finally {
      setIsImporting(false)
    }
  }

  async function processAll() {
    const targets = items.filter((item) => item.status !== 'done')
    if (!targets.length || isProcessing) return
    setIsProcessing(true)
    const freshGpuHealth = gpuHealth ?? await checkGpuClassifier()
    if (freshGpuHealth && !gpuHealth) setGpuHealth(freshGpuHealth)
    let useGpu = Boolean(freshGpuHealth)
    const classificationMemory = createClassificationMemory()
    for (const target of targets) {
      setItems((current) => current.map((item) => item.id === target.id ? { ...item, status: 'processing', error: undefined } : item))
      const result = await classifyItem(target, setModelProgress, useGpu, classificationMemory)
      const { engine, ...classification } = result
      const openResult = classification as typeof classification & { albumName?: string; filenameStem?: string; caption?: string; objects?: string[]; ocrText?: string; scoredTags?: Array<{ name: string; score: number; rawScore?: number }>; classificationMethod?: string; visualFingerprint?: string; evidence?: string[]; classificationReason?: string; reviewRequired?: boolean; reviewReasons?: string[] }
      let resolvedAlbumId = classification.albumId
      if (openResult.albumName) {
        const resolvedAlbum = dynamicAlbum(openResult.albumName, albumsRef.current)
        resolvedAlbumId = resolvedAlbum.id
        if (!albumsRef.current.some((album) => album.id === resolvedAlbum.id)) {
          albumsRef.current = [...albumsRef.current, resolvedAlbum]
          setAlbums(albumsRef.current)
        }
      }
      setLastEngine(engine)
      if (useGpu && engine === 'browser') {
        useGpu = false
        setGpuHealth(null)
      }
      setItems((current) => {
        const resolved = current.map((item) => item.id === target.id ? {
          ...item,
          albumId: resolvedAlbumId,
          confidence: classification.confidence,
          tags: classification.tags,
          caption: openResult.caption,
          objects: openResult.objects,
          ocrText: openResult.ocrText,
          scoredTags: openResult.scoredTags,
          classificationMethod: openResult.classificationMethod,
          visualFingerprint: openResult.visualFingerprint,
          evidence: openResult.evidence,
          classificationReason: openResult.classificationReason,
          reviewRequired: openResult.reviewRequired,
          reviewReasons: openResult.reviewReasons,
          error: 'error' in classification ? classification.error : undefined,
          status: 'done' as const,
        } : item)
        const album = albumsRef.current.find((entry) => entry.id === resolvedAlbumId) ?? albumsRef.current.at(-1)!
        const siblings = resolved.filter((item) => item.albumId === resolvedAlbumId && item.id !== target.id)
        return resolved.map((item) => item.id === target.id ? { ...item, outputName: suggestedName(item, album.name, siblings.length, openResult.filenameStem) } : item)
      })
    }
    setModelProgress(null)
    setIsProcessing(false)
  }

  function updateItem(id: string, patch: Partial<MediaItem>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item))
  }

  function removeItem(id: string) {
    setItems((current) => {
      const target = current.find((item) => item.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return current.filter((item) => item.id !== id)
    })
  }

  function clearAll() {
    items.forEach((item) => URL.revokeObjectURL(item.previewUrl))
    setItems([])
    setWarnings([])
    setActiveAlbum('all')
  }

  function renameAlbum(id: string) {
    const current = albums.find((album) => album.id === id)
    if (!current) return
    const proposed = window.prompt('Tên album mới', current.name)
    const safeName = proposed ? sanitizeSegment(proposed) : ''
    if (safeName) setAlbums((entries) => entries.map((album) => album.id === id ? { ...album, name: safeName } : album))
  }

  async function exportZip() {
    if (!items.length || isExporting) return
    setIsExporting(true)
    try {
      const zip = new JSZip()
      const usedNames = new Map<string, number>()
      const manifest = []
      for (const item of items) {
        const album = albums.find((entry) => entry.id === item.albumId) ?? albums.at(-1)!
        const folderName = sanitizeSegment(album.name) || 'Khác'
        const requestedName = sanitizeSegment(item.outputName) || item.originalName
        const key = `${folderName}/${requestedName}`.toLowerCase()
        const duplicateIndex = usedNames.get(key) ?? 0
        usedNames.set(key, duplicateIndex + 1)
        const dot = requestedName.lastIndexOf('.')
        const uniqueName = duplicateIndex === 0 ? requestedName : `${requestedName.slice(0, dot > 0 ? dot : undefined)}_${duplicateIndex + 1}${dot > 0 ? requestedName.slice(dot) : ''}`
        zip.folder(folderName)?.file(uniqueName, item.file)
        manifest.push({ original: item.sourcePath, output: `${folderName}/${uniqueName}`, classificationMethod: item.classificationMethod, visualFingerprint: item.visualFingerprint, confidence: item.confidence, scoredTags: item.scoredTags, reviewRequired: item.reviewRequired, reviewReasons: item.reviewReasons, evidence: item.evidence, classificationReason: item.classificationReason, caption: item.caption, tags: item.tags, objects: item.objects, ocrText: item.ocrText })
      }
      zip.file('phan-loai.json', JSON.stringify({ exportedAt: new Date().toISOString(), files: manifest }, null, 2))
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 5 }, streamFiles: true })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `localens-${new Date().toISOString().slice(0, 10)}.zip`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } finally {
      setIsExporting(false)
    }
  }

  const progress = items.length ? Math.round((doneCount / items.length) * 100) : 0

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Về đầu trang">
          <span className="brand-mark"><span /><span /><span /></span>
          <span>localens</span>
        </button>
        <nav aria-label="Điều hướng chính">
          <a href="#workspace">Không gian làm việc</a>
          <button onClick={() => setShowHelp(true)}>Cách hoạt động</button>
        </nav>
        <div className={`privacy-pill ${gpuHealth ? 'gpu-online' : ''}`} title={gpuHealth ? `${gpuHealth.model} trên ${gpuHealth.gpu}` : 'CPU/WASM trong trình duyệt'}>
          {gpuHealth ? <Cpu size={14} /> : <LockKeyhole size={14} />}
          {gpuHealth ? 'GPU local đã kết nối' : '100% trên thiết bị'}
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="eyebrow"><Sparkles size={14} /> AI local · không phí sử dụng</div>
          <h1>Gọn thư viện ảnh.<br /><em>Nhẹ cả đầu.</em></h1>
          <p>Thả ảnh và video vào. Localens tự phân tích, đặt tên và gom chúng vào từng album — ngay trên máy của bạn.</p>
          <div className="trust-row">
            <span><ShieldCheck size={17} /> Không tải lên cloud</span>
            <span><Cpu size={17} /> {gpuHealth ? 'Qwen3-VL + SigLIP trên GPU' : 'CPU local, tự chuyển GPU khi có'}</span>
            <span><Archive size={17} /> Xuất một tệp ZIP gọn gàng</span>
            <span><Pencil size={17} /> Chỉnh sửa trước khi tải</span>
          </div>
        </section>

        <section className="workspace" id="workspace">
          <div
            className={`drop-zone ${isDragging ? 'dragging' : ''} ${items.length ? 'compact' : ''}`}
            onDragEnter={(event) => { event.preventDefault(); setIsDragging(true) }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { if (event.currentTarget === event.target) setIsDragging(false) }}
            onDrop={(event) => { event.preventDefault(); setIsDragging(false); void importFiles(event.dataTransfer.files) }}
          >
            <div className="upload-orbit"><Upload size={25} /><i /><i /></div>
            <h2>{isImporting ? 'Đang đọc tệp…' : items.length ? 'Thêm media khác' : 'Đưa thư viện của bạn vào đây'}</h2>
            <p>Kéo thả tệp hoặc chọn một cách bên dưới</p>
            <div className="upload-actions">
              <button className="primary" onClick={() => fileInput.current?.click()}><ImageIcon size={17} /> Chọn ảnh & video</button>
              <button onClick={() => archiveInput.current?.click()}><FileArchive size={17} /> Chọn ZIP</button>
              <button onClick={() => folderInput.current?.click()}><FolderInput size={17} /> Chọn thư mục</button>
            </div>
            <input ref={fileInput} hidden type="file" multiple accept="image/*,video/*" onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void importFiles(files) }} />
            <input ref={archiveInput} hidden type="file" multiple accept=".zip,application/zip" onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void importFiles(files) }} />
            <input ref={folderInput} hidden type="file" multiple {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)} onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void importFiles(files) }} />
            <small>JPG, PNG, WebP, GIF, MP4, WebM, MOV và ZIP · tối đa 750 MB mỗi ZIP</small>
          </div>

          {warnings.length > 0 && <div className="warning-box"><CircleHelp size={18} /><div>{warnings.slice(0, 4).map((warning) => <p key={warning}>{warning}</p>)}</div><button onClick={() => setWarnings([])} aria-label="Đóng cảnh báo"><X size={16} /></button></div>}

          {items.length > 0 && (
            <div className="project-area">
              <div className="project-head">
                <div>
                  <span className="section-kicker">Bộ sưu tập hiện tại</span>
                  <h2>{items.length} tệp đang chờ bạn</h2>
                </div>
                <div className="project-actions">
                  <button className="ghost danger" onClick={clearAll}><Trash2 size={16} /> Xóa tất cả</button>
                  <button className="analyze-button" onClick={() => void processAll()} disabled={isProcessing || doneCount === items.length}>
                    {isProcessing ? <LoaderCircle className="spin" size={18} /> : doneCount === items.length ? <Check size={18} /> : <Sparkles size={18} />}
                    {isProcessing ? 'Đang phân tích…' : doneCount === items.length ? 'Đã phân loại' : gpuHealth ? 'Phân tích bằng GPU' : 'Phân tích dự phòng'}
                  </button>
                </div>
              </div>

              {(isProcessing || doneCount > 0) && (
                <div className="progress-card">
                  <div className="progress-copy">
                    <span>{isProcessing ? 'AI đang sắp xếp thư viện' : 'Đã hoàn tất phân loại'}</span>
                    <b>{doneCount}/{items.length} tệp</b>
                  </div>
                  <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
                  {isProcessing && gpuHealth && <small>Qwen3-VL đang đề xuất tag; SigLIP chấm điểm từng tag trên {gpuHealth.gpu}.</small>}
                  {isProcessing && !gpuHealth && modelProgress && <small>{modelProgress.status === 'progress' ? `Đang tải mô hình dự phòng ${Math.round(modelProgress.progress ?? 0)}% · chỉ cần tải lần đầu` : 'Đang chuẩn bị CLIP dự phòng trong trình duyệt · kết quả sẽ được đánh dấu cần kiểm tra'}</small>}
                  {!isProcessing && lastEngine && <small>Lượt phân tích vừa rồi dùng {lastEngine === 'gpu' ? 'Qwen3-VL + SigLIP tag ranking trên GPU local' : 'CLIP dự phòng trong trình duyệt'}.</small>}
                </div>
              )}

              <div className="album-strip">
                <div className={`album-card all ${activeAlbum === 'all' ? 'active' : ''}`}>
                  <button className="album-select" onClick={() => setActiveAlbum('all')}>
                    <div className="album-art mosaic"><span /><span /><span /><span /></div>
                    <strong>Tất cả</strong><small>{items.length} tệp</small>
                  </button>
                </div>
                {albums.filter((album) => albumCounts[album.id] > 0).map((album) => (
                  <div className={`album-card ${activeAlbum === album.id ? 'active' : ''}`} key={album.id}>
                    <button className="album-select" onClick={() => setActiveAlbum(album.id)}>
                      <div className="album-art" style={{ '--album-color': album.color } as React.CSSProperties}>
                        {items.filter((item) => item.albumId === album.id).slice(0, 3).map((item) => item.kind === 'image' ? <img key={item.id} src={item.previewUrl} alt="" /> : <video key={item.id} src={item.previewUrl} muted />)}
                        {!albumCounts[album.id] && <ImageIcon />}
                      </div>
                      <span className="album-title"><strong>{album.name}</strong></span>
                      <small>{albumCounts[album.id]} tệp</small>
                    </button>
                    <button className="album-rename" onClick={() => renameAlbum(album.id)} aria-label={`Đổi tên ${album.name}`}><Pencil size={12} /></button>
                  </div>
                ))}
              </div>

              <div className="review-toolbar">
                <div className="review-title"><ListFilter size={19} /><span>Kiểm tra & chỉnh sửa</span><b>{visibleItems.length}</b></div>
                <div className="filters">
                  <div className="search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tên tệp…" /></div>
                  <div className="segmented">
                    <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Tất cả</button>
                    <button className={filter === 'image' ? 'active' : ''} onClick={() => setFilter('image')}><ImageIcon size={14} /> Ảnh</button>
                    <button className={filter === 'video' ? 'active' : ''} onClick={() => setFilter('video')}><Video size={14} /> Video</button>
                  </div>
                </div>
              </div>

              <div className="media-grid">
                {visibleItems.map((item) => {
                  const album = albums.find((entry) => entry.id === item.albumId) ?? albums.at(-1)!
                  return <article className="media-card" key={item.id}>
                    <div className="media-preview">
                      {item.kind === 'image' ? <img src={item.previewUrl} alt={item.originalName} /> : <><video src={item.previewUrl} muted preload="metadata" /><span className="play"><Play size={16} fill="currentColor" /></span></>}
                      <span className={`status-badge ${item.status} ${item.reviewRequired ? 'needs-review' : ''}`}>{item.status === 'processing' ? <><LoaderCircle className="spin" size={11} /> Đang đọc</> : item.status === 'done' ? item.reviewRequired ? <><CircleHelp size={11} /> Cần kiểm tra</> : <><Check size={11} /> {item.confidence ? `${Math.round(item.confidence * 100)}%` : 'Đã xếp'}</> : 'Chưa xử lý'}</span>
                      <button className="remove" onClick={() => removeItem(item.id)} aria-label={`Xóa ${item.originalName}`}><X size={14} /></button>
                    </div>
                    <div className="media-body">
                      <label>Tên tệp mới</label>
                      <div className="filename-field"><input value={item.outputName} onChange={(event) => updateItem(item.id, { outputName: sanitizeSegment(event.target.value) })} /><Pencil size={13} /></div>
                      <label>Album</label>
                      <div className="select-wrap"><span style={{ background: album.color }} /><select value={item.albumId} onChange={(event) => updateItem(item.id, { albumId: event.target.value, status: 'done' })}>{albums.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select><ChevronDown size={14} /></div>
                      <small className="original">Gốc: {item.originalName}</small>
                      {item.caption && <p className="ai-caption">{item.caption}</p>}
                      {item.scoredTags?.length ? <div className="tag-ranking" aria-label="Ranked tags">{item.scoredTags.slice(0, 5).map((tag, index) => <div key={tag.name} className={index === 0 ? 'winner' : ''}><span><b>#{index + 1}</b> {tag.name}</span><strong>{Math.round(tag.score * 100)}%</strong><i><em style={{ width: `${Math.max(3, tag.score * 100)}%` }} /></i></div>)}</div> : item.tags.length > 0 && <div className="ai-tags">{item.tags.slice(0, 5).map((tag) => <span key={tag}>{tag}</span>)}</div>}
                      {item.classificationReason && <small className="classification-reason">Lý do: {item.classificationReason}</small>}
                      {item.reviewRequired && <small className="review-reasons">Cần kiểm tra: {item.reviewReasons?.join(' · ')}</small>}
                      {item.ocrText && <small className="ocr-text" title={item.ocrText}>OCR: {item.ocrText}</small>}
                      {item.error && <small className="fallback-note" title={item.error}>Đã dùng tên tệp để phân loại</small>}
                    </div>
                  </article>
                })}
              </div>

              <div className="export-bar">
                <div className="export-icon"><Download size={22} /></div>
                <div><strong>Sẵn sàng mang thư viện gọn gàng về máy?</strong><span>Mỗi album là một thư mục, kèm tệp thông tin phân loại.</span></div>
                <button onClick={() => void exportZip()} disabled={isExporting}>{isExporting ? <LoaderCircle className="spin" size={18} /> : <FileArchive size={18} />} {isExporting ? 'Đang đóng gói…' : 'Tải thư viện ZIP'}</button>
              </div>
            </div>
          )}
        </section>
      </main>

      <footer><span className="brand mini"><span className="brand-mark"><span /><span /><span /></span><span>localens</span></span><p>Ảnh của bạn ở lại với bạn.</p><span>Local-first · Open-source ready</span></footer>

      {showHelp && <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setShowHelp(false) }}><section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><button className="modal-close" onClick={() => setShowHelp(false)}><X /></button><span className="eyebrow">3 bước đơn giản</span><h2 id="help-title">Từ hỗn độn đến ngăn nắp</h2><div className="steps"><div><b>01</b><Upload /><h3>Nạp thư viện</h3><p>Chọn nhiều tệp, cả thư mục hoặc ZIP. Media không được gửi lên cloud.</p></div><div><b>02</b><Sparkles /><h3>Rank English tags</h3><p>Qwen3-VL proposes tags; SigLIP scores them. Visual matches reuse one result, while similar images share prior winning tags.</p></div><div><b>03</b><Download /><h3>Kiểm tra & tải</h3><p>Xem bảng điểm, đổi tên hoặc album rồi tải ZIP đã sắp xếp.</p></div></div><p className="model-note"><ShieldCheck /> Kết nối GPU đi qua SSH/Tailscale và chỉ xuất hiện ở loopback 127.0.0.1; không có API trả phí hay cổng công khai.</p></section></div>}
    </div>
  )
}
