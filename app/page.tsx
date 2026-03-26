'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Upload, ImageIcon, Download, Loader2,
  AlertCircle, CheckCircle2, Move, RefreshCw,
} from 'lucide-react'

type Preset = 'noticias' | 'ebooks' | 'cuadrada' | 'webp-only' | 'manual'

interface PresetOption {
  id: Preset
  label: string
  desc: string
  w: number | null
  h: number | null
}

const PRESETS: PresetOption[] = [
  { id: 'noticias',  label: 'Noticias',          desc: '796 × 348 px',    w: 796,  h: 348  },
  { id: 'ebooks',    label: 'Ebooks / Recursos',  desc: '1280 × 960 px',  w: 1280, h: 960  },
  { id: 'cuadrada',  label: 'Cuadrada',           desc: '1080 × 1080 px', w: 1080, h: 1080 },
  { id: 'webp-only', label: 'Solo comprimir',     desc: 'Sin redimensionar', w: null, h: null },
  { id: 'manual',    label: 'Personalizado',      desc: 'Tamaño manual',  w: null, h: null },
]

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

// ─── Crop Preview ────────────────────────────────────────────────────────────

function CropPreview({
  src,
  targetW,
  targetH,
  onCropChange,
}: {
  src: string
  targetW: number
  targetH: number
  onCropChange: (x: number, y: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 })
  const [containerW, setContainerW] = useState(0)
  // crop top-left in display pixels
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const dragging = useRef(false)
  const origin = useRef({ mx: 0, my: 0, px: 0, py: 0 })

  // Track container width
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setContainerW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Display dimensions
  const imgAR = naturalSize.w > 0 ? naturalSize.w / naturalSize.h : 1
  const dispW = containerW
  const dispH = containerW > 0 ? Math.round(containerW / imgAR) : 0

  // Crop overlay dimensions (fill image as much as possible at target AR)
  const cropAR = targetW / targetH
  let cropW: number, cropH: number
  if (cropAR > imgAR) {
    cropW = dispW
    cropH = Math.round(dispW / cropAR)
  } else {
    cropH = dispH
    cropW = Math.round(dispH * cropAR)
  }

  const maxX = Math.max(0, dispW - cropW)
  const maxY = Math.max(0, dispH - cropH)
  const cx = Math.max(0, Math.min(pos.x, maxX))
  const cy = Math.max(0, Math.min(pos.y, maxY))

  // Re-center when dimensions change (e.g. on load or preset switch)
  useEffect(() => {
    if (dispW > 0 && dispH > 0) setPos({ x: maxX / 2, y: maxY / 2 })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispW, dispH, cropW, cropH])

  // Report percentage to parent
  useEffect(() => {
    const px = maxX > 0 ? (cx / maxX) * 100 : 50
    const py = maxY > 0 ? (cy / maxY) * 100 : 50
    onCropChange(px, py)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cx, cy, maxX, maxY])

  // Drag handlers
  const startDrag = (mx: number, my: number) => {
    dragging.current = true
    origin.current = { mx, my, px: cx, py: cy }
  }
  const moveDrag = useCallback((mx: number, my: number) => {
    if (!dragging.current) return
    setPos({
      x: Math.max(0, Math.min(origin.current.px + mx - origin.current.mx, maxX)),
      y: Math.max(0, Math.min(origin.current.py + my - origin.current.my, maxY)),
    })
  }, [maxX, maxY])

  useEffect(() => {
    const up = () => { dragging.current = false }
    const mm = (e: MouseEvent) => moveDrag(e.clientX, e.clientY)
    const tm = (e: TouchEvent) => { e.preventDefault(); moveDrag(e.touches[0].clientX, e.touches[0].clientY) }
    window.addEventListener('mouseup', up)
    window.addEventListener('mousemove', mm)
    window.addEventListener('touchend', up)
    window.addEventListener('touchmove', tm, { passive: false })
    return () => {
      window.removeEventListener('mouseup', up)
      window.removeEventListener('mousemove', mm)
      window.removeEventListener('touchend', up)
      window.removeEventListener('touchmove', tm)
    }
  }, [moveDrag])

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-xl select-none bg-black"
        style={{ height: dispH > 0 ? dispH : 'auto', minHeight: 80 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={src}
          alt="Previsualización"
          className="block w-full"
          onLoad={() => {
            if (imgRef.current) {
              setNaturalSize({ w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight })
            }
          }}
          draggable={false}
        />

        {/* Crop handle – box-shadow darkens everything outside it */}
        {dispH > 0 && cropW > 0 && (
          <div
            className="absolute border-2 border-white cursor-move touch-none"
            style={{
              left: cx,
              top: cy,
              width: cropW,
              height: cropH,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
            }}
            onMouseDown={(e) => { e.preventDefault(); startDrag(e.clientX, e.clientY) }}
            onTouchStart={(e) => startDrag(e.touches[0].clientX, e.touches[0].clientY)}
          >
            {/* Rule-of-thirds grid */}
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="border border-white/20" />
              ))}
            </div>
            {/* Center icon */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <Move className="text-white/50 w-6 h-6 drop-shadow" />
            </div>
            {/* Corner handles */}
            {[
              'top-0 left-0 border-l-2 border-t-2',
              'top-0 right-0 border-r-2 border-t-2',
              'bottom-0 left-0 border-l-2 border-b-2',
              'bottom-0 right-0 border-r-2 border-b-2',
            ].map((cls, i) => (
              <div key={i} className={`absolute w-4 h-4 border-white ${cls}`} />
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-adipa-navy/50 text-center">
        Arrastrá el recuadro para elegir qué parte conservar
      </p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [file, setFile]       = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [preset, setPreset]   = useState<Preset>('noticias')
  const [customW, setCustomW] = useState('')
  const [customH, setCustomH] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [cropX, setCropX]     = useState(50)
  const [cropY, setCropY]     = useState(50)
  const [targetKB, setTargetKB] = useState(100)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [result, setResult]   = useState<{
    url: string; originalSize: number; outputSize: number; quality: number
  } | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  // Resolve target dimensions for the active preset
  const activeDims = (() => {
    const p = PRESETS.find(p => p.id === preset)!
    if (p.w && p.h) return { w: p.w, h: p.h }
    if (preset === 'manual') {
      const w = parseInt(customW, 10); const h = parseInt(customH, 10)
      if (w > 0 && h > 0) return { w, h }
    }
    return null
  })()

  const handleFile = useCallback((f: File) => {
    setError(null); setResult(null)
    if (!f.type.startsWith('image/')) { setError('El archivo debe ser una imagen.'); return }
    if (f.size > 4 * 1024 * 1024) { setError('El archivo supera el límite de 4 MB.'); return }
    setFile(f)
    const reader = new FileReader()
    reader.onload = (e) => setPreview(e.target?.result as string)
    reader.readAsDataURL(f)
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const f = e.dataTransfer.files[0]; if (f) handleFile(f)
  }, [handleFile])

  const handleProcess = async () => {
    if (!file) return
    setLoading(true); setError(null); setResult(null)
    try {
      const fd = new FormData()
      fd.append('image', file)
      fd.append('preset', preset)
      fd.append('cropX', String(cropX))
      fd.append('cropY', String(cropY))
      fd.append('targetKB', String(targetKB))
      if (preset === 'manual') { fd.append('width', customW); fd.append('height', customH) }

      const res = await fetch('/api/process', { method: 'POST', body: fd })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Error al procesar.'); return }

      const originalSize = parseInt(res.headers.get('X-Original-Size') ?? '0', 10)
      const outputSize   = parseInt(res.headers.get('X-Output-Size')   ?? '0', 10)
      const quality      = parseInt(res.headers.get('X-Quality-Used')  ?? '85', 10)
      const url = URL.createObjectURL(await res.blob())
      setResult({ url, originalSize, outputSize, quality })
    } catch {
      setError('Error de red al conectar con el servidor.')
    } finally {
      setLoading(false)
    }
  }

  const reduction = result ? Math.round((1 - result.outputSize / result.originalSize) * 100) : 0

  return (
    <main className="min-h-screen bg-adipa-bg-light">
      {/* Header */}
      <header className="bg-adipa-gradient py-8 px-4 text-center shadow-lg">
        <div className="flex items-center justify-center gap-3 mb-2">
          <ImageIcon className="text-white w-8 h-8" />
          <h1 className="text-3xl font-bold text-white tracking-tight">Optimizador de Imágenes</h1>
        </div>
        <p className="text-adipa-blue-light text-sm">Comunicaciones ADIPA · WebP · Máximo 100 KB</p>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">

        {/* ── Upload / Crop preview ── */}
        {!preview ? (
          // Drop zone
          <div
            className={`rounded-2xl border-2 border-dashed transition-all cursor-pointer select-none
              ${isDragging
                ? 'border-adipa-purple bg-adipa-purple-light scale-[1.01]'
                : 'border-adipa-cyan bg-white hover:border-adipa-purple hover:bg-adipa-purple-light/30'}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            <div className="py-16 flex flex-col items-center gap-3 text-adipa-navy/50">
              <Upload className="w-10 h-10 text-adipa-purple" />
              <p className="font-semibold text-adipa-navy">Arrastrá o hacé clic para subir</p>
              <p className="text-sm">PNG, JPG, WEBP · Máx. 4 MB</p>
            </div>
          </div>
        ) : (
          // Image loaded: show crop preview or plain preview
          <div className="space-y-2">
            {/* File info bar */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-adipa-navy/50 truncate max-w-[70%]">
                {file?.name} · {formatBytes(file?.size ?? 0)}
              </p>
              <button
                onClick={() => inputRef.current?.click()}
                className="flex items-center gap-1.5 text-xs font-medium text-adipa-purple
                  hover:text-adipa-purple-deep transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Cambiar imagen
              </button>
            </div>

            {activeDims ? (
              <CropPreview
                key={`${preset}-${activeDims.w}-${activeDims.h}`}
                src={preview}
                targetW={activeDims.w}
                targetH={activeDims.h}
                onCropChange={(x, y) => { setCropX(x); setCropY(y) }}
              />
            ) : (
              // webp-only or manual without dims: plain preview
              <div className="rounded-2xl overflow-hidden bg-white border border-adipa-cyan/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Previsualización" className="w-full max-h-72 object-contain" />
                {preset === 'manual' && (
                  <p className="text-xs text-adipa-navy/50 text-center py-2">
                    Ingresá las dimensiones para ver el área de recorte
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />

        {/* ── Preset selector ── */}
        <div>
          <p className="text-sm font-semibold text-adipa-navy mb-3">Formato de salida</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPreset(p.id)}
                className={`rounded-xl border-2 p-3 text-left transition-all
                  ${preset === p.id
                    ? 'border-adipa-purple bg-adipa-purple text-white shadow-md shadow-adipa-purple/30'
                    : 'border-adipa-cyan/50 bg-white text-adipa-navy hover:border-adipa-purple'}`}
              >
                <p className="font-semibold text-sm">{p.label}</p>
                <p className={`text-xs mt-0.5 ${preset === p.id ? 'text-white/80' : 'text-adipa-navy/50'}`}>
                  {p.desc}
                </p>
              </button>
            ))}
          </div>

          {preset === 'manual' && (
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1">
                <label className="text-xs text-adipa-navy/60 block mb-1">Ancho (px)</label>
                <input
                  type="number" value={customW}
                  onChange={(e) => setCustomW(e.target.value)}
                  placeholder="ej. 800" min={1} max={10000}
                  className="w-full rounded-lg border border-adipa-cyan px-3 py-2 text-sm
                    focus:outline-none focus:ring-2 focus:ring-adipa-purple"
                />
              </div>
              <span className="text-adipa-navy/40 mt-5">×</span>
              <div className="flex-1">
                <label className="text-xs text-adipa-navy/60 block mb-1">Alto (px)</label>
                <input
                  type="number" value={customH}
                  onChange={(e) => setCustomH(e.target.value)}
                  placeholder="ej. 600" min={1} max={10000}
                  className="w-full rounded-lg border border-adipa-cyan px-3 py-2 text-sm
                    focus:outline-none focus:ring-2 focus:ring-adipa-purple"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Target size slider ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-adipa-navy">Tamaño máximo de salida</p>
            <span className="text-sm font-bold text-adipa-purple">{targetKB} KB</span>
          </div>
          <input
            type="range"
            min={20}
            max={100}
            step={5}
            value={targetKB}
            onChange={(e) => setTargetKB(Number(e.target.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer
              bg-gradient-to-r from-adipa-purple to-adipa-blue
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-5
              [&::-webkit-slider-thumb]:h-5
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-white
              [&::-webkit-slider-thumb]:border-2
              [&::-webkit-slider-thumb]:border-adipa-purple
              [&::-webkit-slider-thumb]:shadow-md"
          />
          <div className="flex justify-between text-xs text-adipa-navy/40 mt-1">
            <span>20 KB</span>
            <span>100 KB</span>
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── Process button ── */}
        <button
          onClick={handleProcess}
          disabled={!file || loading}
          className="w-full py-3 rounded-xl font-semibold text-white bg-adipa-gradient
            disabled:opacity-40 disabled:cursor-not-allowed
            hover:opacity-90 active:scale-[0.99] transition-all shadow-lg shadow-adipa-purple/30
            flex items-center justify-center gap-2"
        >
          {loading
            ? <><Loader2 className="w-5 h-5 animate-spin" />Procesando…</>
            : <><ImageIcon className="w-5 h-5" />Optimizar imagen</>}
        </button>

        {/* ── Result ── */}
        {result && (
          <div className="bg-white rounded-2xl border border-adipa-purple-light shadow-sm overflow-hidden">
            <div className="bg-adipa-gradient px-4 py-3 flex items-center gap-2">
              <CheckCircle2 className="text-white w-5 h-5" />
              <span className="text-white font-semibold">Imagen optimizada</span>
            </div>
            <div className="p-5 space-y-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.url} alt="Resultado"
                className="w-full max-h-60 object-contain rounded-xl bg-adipa-bg-light" />

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-adipa-bg-light rounded-xl p-3">
                  <p className="text-xs text-adipa-navy/50 mb-1">Original</p>
                  <p className="font-bold text-adipa-navy">{formatBytes(result.originalSize)}</p>
                </div>
                <div className="bg-adipa-bg-light rounded-xl p-3">
                  <p className="text-xs text-adipa-navy/50 mb-1">Resultado</p>
                  <p className="font-bold text-adipa-purple">{formatBytes(result.outputSize)}</p>
                </div>
                <div className="bg-adipa-bg-light rounded-xl p-3">
                  <p className="text-xs text-adipa-navy/50 mb-1">Reducción</p>
                  <p className={`font-bold ${reduction >= 50 ? 'text-green-600' : 'text-adipa-blue'}`}>
                    {reduction}%
                  </p>
                </div>
              </div>

              {result.outputSize > 100 * 1024 && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  La imagen supera los 100 KB incluso al mínimo de calidad (40). Considera usar un tamaño menor.
                </p>
              )}

              <a href={result.url} download="optimized.webp"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl
                  bg-adipa-gradient text-white font-semibold shadow-md shadow-adipa-purple/30
                  hover:opacity-90 transition-all">
                <Download className="w-5 h-5" />
                Descargar .webp
              </a>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
