import { useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import { Archive, Check, ChevronDown, CircleHelp, Download, FileArchive, FolderInput, Image as ImageIcon, LayoutGrid, ListFilter, LoaderCircle, LockKeyhole, Pencil, Play, Plus, RotateCcw, Search, ShieldCheck, Sparkles, Trash2, Upload, Video, X } from 'lucide-react'
import { DEFAULT_ALBUMS } from './catalog'
import { classifyItem, expandInputFiles, makeMediaItem, sanitizeSegment, suggestedName } from './media'
import type { AlbumDefinition, MediaItem, ModelProgress } from './types'

type Filter = 'all' | 'image' | 'video'

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
  const fileInput = useRef<HTMLInputElement>(null)
  const archiveInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)

  useEffect(() => () => items.forEach((item) => URL.revokeObjectURL(item.previewUrl)), [])

  const doneCount = items.filter((item) => item.status === 'done').length
  const albumCounts = useMemo(() => Object.fromEntries(albums.map((album) => [album.id, items.filter((item) => item.albumId === album.id).length])), [albums, items])
  const visibleItems = useMemo(() => items.filter((item) => {
    const matchesType = filter === 'all' || item.kind === filter
    const matchesAlbum = activeAlbum === 'all' || item.albumId === activeAlbum
    const haystack = `${item.originalName} ${item.outputName}`.toLowerCase()
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
    for (const target of targets) {
      setItems((current) => current.map((item) => item.id === target.id ? { ...item, status: 'processing', error: undefined } : item))
      const result = await classifyItem(target, setModelProgress)
      setItems((current) => {
        const resolved = current.map((item) => item.id === target.id ? { ...item, ...result, status: 'done' as const } : item)
        const album = albums.find((entry) => entry.id === result.albumId) ?? albums.at(-1)!
        const siblings = resolved.filter((item) => item.albumId === result.albumId && item.id !== target.id)
        return resolved.map((item) => item.id === target.id ? { ...item, outputName: suggestedName({ ...item, albumId: result.albumId }, album.name, siblings.length) } : item)
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
        manifest.push({ original: item.sourcePath, output: `${folderName}/${uniqueName}`, confidence: item.confidence, tags: item.tags })
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
        <div className="privacy-pill"><LockKeyhole size={14} /> 100% trên thiết bị</div>
      </header>

      <main>
        <section className="hero">
          <div className="eyebrow"><Sparkles size={14} /> AI local · không phí sử dụng</div>
          <h1>Gọn thư viện ảnh.<br /><em>Nhẹ cả đầu.</em></h1>
          <p>Thả ảnh và video vào. Localens tự phân tích, đặt tên và gom chúng vào từng album — ngay trên máy của bạn.</p>
          <div className="trust-row">
            <span><ShieldCheck size={17} /> Không tải lên cloud</span>
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
            <input ref={fileInput} hidden type="file" multiple accept="image/*,video/*" onChange={(event) => event.target.files && void importFiles(event.target.files)} />
            <input ref={archiveInput} hidden type="file" multiple accept=".zip,application/zip" onChange={(event) => event.target.files && void importFiles(event.target.files)} />
            <input ref={folderInput} hidden type="file" multiple {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)} onChange={(event) => event.target.files && void importFiles(event.target.files)} />
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
                    {isProcessing ? 'Đang phân tích…' : doneCount === items.length ? 'Đã phân loại' : 'Phân tích bằng AI'}
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
                  {modelProgress && isProcessing && <small>{modelProgress.status === 'progress' ? `Đang tải mô hình local ${Math.round(modelProgress.progress ?? 0)}% · chỉ cần tải lần đầu` : 'Đang chuẩn bị mô hình local…'}</small>}
                </div>
              )}

              <div className="album-strip">
                <button className={`album-card all ${activeAlbum === 'all' ? 'active' : ''}`} onClick={() => setActiveAlbum('all')}>
                  <div className="album-art mosaic"><span /><span /><span /><span /></div>
                  <strong>Tất cả</strong><small>{items.length} tệp</small>
                </button>
                {albums.filter((album) => albumCounts[album.id] > 0).map((album) => (
                  <button className={`album-card ${activeAlbum === album.id ? 'active' : ''}`} key={album.id} onClick={() => setActiveAlbum(album.id)}>
                    <div className="album-art" style={{ '--album-color': album.color } as React.CSSProperties}>
                      {items.filter((item) => item.albumId === album.id).slice(0, 3).map((item) => item.kind === 'image' ? <img key={item.id} src={item.previewUrl} alt="" /> : <video key={item.id} src={item.previewUrl} muted />)}
                      {!albumCounts[album.id] && <ImageIcon />}
                    </div>
                    <span className="album-title"><strong>{album.name}</strong><span onClick={(event) => { event.stopPropagation(); renameAlbum(album.id) }} role="button" tabIndex={0} aria-label={`Đổi tên ${album.name}`}><Pencil size={12} /></span></span>
                    <small>{albumCounts[album.id]} tệp</small>
                  </button>
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
                      <span className={`status-badge ${item.status}`}>{item.status === 'processing' ? <><LoaderCircle className="spin" size={11} /> Đang đọc</> : item.status === 'done' ? <><Check size={11} /> {item.confidence ? `${Math.round(item.confidence * 100)}%` : 'Đã xếp'}</> : 'Chưa xử lý'}</span>
                      <button className="remove" onClick={() => removeItem(item.id)} aria-label={`Xóa ${item.originalName}`}><X size={14} /></button>
                    </div>
                    <div className="media-body">
                      <label>Tên tệp mới</label>
                      <div className="filename-field"><input value={item.outputName} onChange={(event) => updateItem(item.id, { outputName: sanitizeSegment(event.target.value) })} /><Pencil size={13} /></div>
                      <label>Album</label>
                      <div className="select-wrap"><span style={{ background: album.color }} /><select value={item.albumId} onChange={(event) => updateItem(item.id, { albumId: event.target.value, status: 'done' })}>{albums.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select><ChevronDown size={14} /></div>
                      <small className="original">Gốc: {item.originalName}</small>
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

      {showHelp && <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setShowHelp(false) }}><section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><button className="modal-close" onClick={() => setShowHelp(false)}><X /></button><span className="eyebrow">3 bước đơn giản</span><h2 id="help-title">Từ hỗn độn đến ngăn nắp</h2><div className="steps"><div><b>01</b><Upload /><h3>Nạp thư viện</h3><p>Chọn nhiều tệp, cả thư mục hoặc ZIP. Mọi thứ chỉ được đọc trên máy.</p></div><div><b>02</b><Sparkles /><h3>AI phân tích</h3><p>Mô hình CLIP nhận diện nội dung ảnh và các khung hình đại diện của video.</p></div><div><b>03</b><Download /><h3>Kiểm tra & tải</h3><p>Đổi tên, chuyển album rồi tải một ZIP đã sắp xếp hoàn chỉnh.</p></div></div><p className="model-note"><ShieldCheck /> Lần chạy AI đầu tiên cần Internet để tải mô hình miễn phí; các lần sau dùng bản đã lưu trong cache trình duyệt.</p></section></div>}
    </div>
  )
}
