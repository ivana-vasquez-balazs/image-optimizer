'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Upload, ImageIcon, Download, Loader2,
  AlertCircle, CheckCircle2, Move, RefreshCw,
} from 'lucide-react'

// ─── Preset data ─────────────────────────────────────────────────────────────

interface PresetOption {
  id: string; label: string; desc: string; w: number | null; h: number | null
}
interface PresetGroup { category: string; presets: PresetOption[] }

const PRESET_GROUPS: PresetGroup[] = [
  {
    category: 'Noticias',
    presets: [
      { id: 'noticias-dest',     label: 'Destacada / Interior', desc: '900 × 507 px', w: 900, h: 507 },
      { id: 'noticias-lateral',  label: 'Banner lateral',       desc: '400 × 985 px', w: 400, h: 985 },
      { id: 'noticias-cta-sq',   label: 'Banner CTA',           desc: '180 × 180 px', w: 180, h: 180 },
      { id: 'noticias-cta-rect', label: 'Banner CTA',           desc: '180 × 200 px', w: 180, h: 200 },
    ],
  },
  {
    category: 'Recursos descargables',
    presets: [
      { id: 'recursos-dest',    label: 'Destacada / Header', desc: '700 × 493 px', w: 700, h: 493 },
      { id: 'recursos-preview', label: 'Vista previa',       desc: '400 × 515 px', w: 400, h: 515 },
    ],
  },
  {
    category: 'Podcast',
    presets: [
      { id: 'podcast-dest',   label: 'Destacada',       desc: '580 × 386 px', w: 580, h: 386 },
      { id: 'podcast-banner', label: 'Banner capítulo', desc: '799 × 348 px', w: 799, h: 348 },
    ],
  },
  {
    category: 'Investigaciones',
    presets: [
      { id: 'invest-caja', label: 'Imagen caja', desc: '580 × 331 px', w: 580, h: 331 },
    ],
  },
  {
    category: 'General',
    presets: [
      { id: 'cuadrada',  label: 'Cuadrada',       desc: '1080 × 1080 px',   w: 1080, h: 1080 },
      { id: 'webp-only', label: 'Solo comprimir', desc: 'Sin redimensionar', w: null, h: null },
      { id: 'manual',    label: 'Personalizado',  desc: 'Tamaño manual',     w: null, h: null },
    ],
  },
]

const ALL_PRESETS = PRESET_GROUPS.flatMap(g => g.presets)

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

// ─── Crop Preview ─────────────────────────────────────────────────────────────

type DragKind = 'move' | 'tl' | 'tr' | 'bl' | 'br'
interface Box { x: number; y: number; w: number; h: number }

function CropPreview({
  src, targetW, targetH,
  onCropChange,
}: {
  src: string
  targetW: number
  targetH: number
  /** Reports (left, top, right, bottom) as fractions 0–1 of the original image */
  onCropChange: (l: number, t: number, r: number, b: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef       = useRef<HTMLImageElement>(null)
  const [nat, setNat]   = useState({ w: 0, h: 0 })
  const [ctrW, setCtrW] = useState(0)
  const [box, setBox]   = useState<Box>({ x: 0, y: 0, w: 0, h: 0 })

  const drag = useRef<{ kind: DragKind; mx0: number; my0: number; box0: Box } | null>(null)

  // Track container width via ResizeObserver
  useEffect(() => {
    const el = containerRef.current; if (!el) return
    const ro = new ResizeObserver(([e]) => setCtrW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const imgAR  = nat.w > 0 ? nat.w / nat.h : 1
  const dispW  = ctrW
  const dispH  = ctrW > 0 ? Math.round(ctrW / imgAR) : 0
  const cropAR = targetW / targetH

  // Re-centre / re-fit when display dims or preset change
  useEffect(() => {
    if (dispW <= 0 || dispH <= 0) return
    let w = dispW, h = Math.round(w / cropAR)
    if (h > dispH) { h = dispH; w = Math.round(h * cropAR) }
    setBox({ x: Math.round((dispW - w) / 2), y: Math.round((dispH - h) / 2), w, h })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispW, dispH, cropAR])

  // Report crop fractions to parent whenever box changes
  useEffect(() => {
    if (dispW <= 0 || dispH <= 0 || box.w <= 0) return
    onCropChange(
      box.x / dispW,
      box.y / dispH,
      (box.x + box.w) / dispW,
      (box.y + box.h) / dispH,
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box, dispW, dispH])

  // ── Drag logic ──────────────────────────────────────────────────────────────

  const applyDrag = useCallback((mx: number, my: number) => {
    const d = drag.current; if (!d) return
    const b0 = d.box0

    if (d.kind === 'move') {
      setBox(prev => ({
        ...prev,
        x: Math.max(0, Math.min(b0.x + mx - d.mx0, dispW - b0.w)),
        y: Math.max(0, Math.min(b0.y + my - d.my0, dispH - b0.h)),
      }))
      return
    }

    // Resize: convert viewport coords → container coords before comparing with
    // anchor (which is in container-relative pixels, not viewport pixels).
    const rect = containerRef.current?.getBoundingClientRect()
    const cmx = mx - (rect?.left ?? 0)
    const cmy = my - (rect?.top  ?? 0)

    // Anchor = opposite corner (stays fixed while user drags this corner)
    const ax = (d.kind === 'tl' || d.kind === 'bl') ? b0.x + b0.w : b0.x
    const ay = (d.kind === 'tl' || d.kind === 'tr') ? b0.y + b0.h : b0.y

    // Raw distance from anchor to mouse (both now in container coords)
    let rw = Math.abs(cmx - ax)
    let rh = Math.abs(cmy - ay)

    // Lock aspect ratio: use whichever dimension implies the larger box
    if (rh * cropAR > rw) rw = rh * cropAR; else rh = rw / cropAR
    rw = Math.max(30, rw); rh = rw / cropAR

    // Top-left corner of the new box
    let nx = (d.kind === 'tr' || d.kind === 'br') ? ax : ax - rw
    let ny = (d.kind === 'bl' || d.kind === 'br') ? ay : ay - rh

    // Clamp to image bounds
    nx = Math.max(0, nx); ny = Math.max(0, ny)
    if (nx + rw > dispW) { rw = dispW - nx; rh = rw / cropAR }
    if (ny + rh > dispH) { rh = dispH - ny; rw = rh * cropAR }
    rw = Math.max(20, rw); rh = rw / cropAR

    setBox({ x: nx, y: ny, w: rw, h: rh })
  }, [dispW, dispH, cropAR])

  useEffect(() => {
    const up = () => { drag.current = null }
    const mm = (e: MouseEvent) => applyDrag(e.clientX, e.clientY)
    const tm = (e: TouchEvent) => { e.preventDefault(); applyDrag(e.touches[0].clientX, e.touches[0].clientY) }
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
  }, [applyDrag])

  const start = (kind: DragKind, mx: number, my: number) => {
    drag.current = { kind, mx0: mx, my0: my, box0: { ...box } }
  }

  // ── Corner handle ────────────────────────────────────────────────────────────
  // Hit area (44 px) is separate from the visual dot (12 px) so it's easy
  // to grab on both desktop and touch without being visually oversized.
  const HIT = 44   // invisible grab area
  const VIS = 12   // visible square

  type Side = 'top' | 'bottom'; type HSide = 'left' | 'right'
  const CornerHandle = ({
    kind, v, h,
  }: { kind: 'tl' | 'tr' | 'bl' | 'br'; v: Side; h: HSide }) => (
    <div
      style={{
        position: 'absolute',
        [v]: -(HIT / 2), [h]: -(HIT / 2),
        width: HIT, height: HIT,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: kind === 'tl' ? 'nw-resize' : kind === 'tr' ? 'ne-resize'
              : kind === 'bl' ? 'sw-resize' : 'se-resize',
        zIndex: 20,
      }}
      onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); start(kind, e.clientX, e.clientY) }}
      onTouchStart={(e) => { e.stopPropagation(); start(kind, e.touches[0].clientX, e.touches[0].clientY) }}
    >
      {/* Visual indicator */}
      <div style={{
        width: VIS, height: VIS,
        background: 'white',
        border: '2.5px solid #7D61F1',
        borderRadius: 2,
        boxShadow: '0 1px 5px rgba(0,0,0,0.5)',
        pointerEvents: 'none',
      }} />
    </div>
  )

  // ── Render ───────────────────────────────────────────────────────────────────
  const showCrop = dispH > 0 && box.w > 0
  // Overlay: 4 divs surround the crop box (no overflow:hidden needed)
  const OV = 'absolute bg-black/55 pointer-events-none'

  return (
    <div className="space-y-1">
      {/* Container: position:relative, NO overflow:hidden → handles protrude */}
      <div ref={containerRef} className="relative rounded-xl select-none bg-black"
           style={{ height: dispH > 0 ? dispH : 'auto', minHeight: 80 }}>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef} src={src} alt="Previsualización"
          className="block w-full rounded-xl"
          onLoad={() => {
            if (imgRef.current) setNat({ w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight })
          }}
          draggable={false}
        />

        {showCrop && (<>
          {/* Dark overlay – 4 surrounding strips */}
          <div className={OV} style={{ top: 0, left: 0, right: 0, height: box.y }} />
          <div className={OV} style={{ top: box.y + box.h, left: 0, right: 0, bottom: 0 }} />
          <div className={OV} style={{ top: box.y, left: 0, width: box.x, height: box.h }} />
          <div className={OV} style={{ top: box.y, left: box.x + box.w, right: 0, height: box.h }} />

          {/* Crop box */}
          <div
            className="absolute touch-none"
            style={{
              left: box.x, top: box.y, width: box.w, height: box.h,
              border: '2px solid white',
              cursor: 'move',
              zIndex: 10,
            }}
            onMouseDown={(e) => { e.preventDefault(); start('move', e.clientX, e.clientY) }}
            onTouchStart={(e) => start('move', e.touches[0].clientX, e.touches[0].clientY)}
          >
            {/* Rule-of-thirds grid */}
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="border border-white/20" />
              ))}
            </div>

            {/* Centre move icon */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <Move className="text-white/50 w-5 h-5 drop-shadow" />
            </div>

            {/* Corner handles */}
            <CornerHandle kind="tl" v="top"    h="left"  />
            <CornerHandle kind="tr" v="top"    h="right" />
            <CornerHandle kind="bl" v="bottom" h="left"  />
            <CornerHandle kind="br" v="bottom" h="right" />
          </div>
        </>)}
      </div>

      <p className="text-xs text-adipa-navy/50 text-center">
        Mover: arrastrá el interior · Redimensionar: arrastrá las esquinas (proporción bloqueada)
      </p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [file, setFile]       = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [preset, setPreset]   = useState<string>('noticias-dest')
  const [customW, setCustomW] = useState('')
  const [customH, setCustomH] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  // Crop region as fractions of the display image (0–1)
  const [cropL, setCropL] = useState(0)
  const [cropT, setCropT] = useState(0)
  const [cropR, setCropR] = useState(1)
  const [cropB, setCropB] = useState(1)
  const [targetKB, setTargetKB] = useState(100)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [result, setResult]     = useState<{
    url: string; originalSize: number; outputSize: number; quality: number
  } | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  const activeDims = (() => {
    if (preset === 'manual') {
      const w = parseInt(customW, 10), h = parseInt(customH, 10)
      if (w > 0 && h > 0) return { w, h }
      return null
    }
    const p = ALL_PRESETS.find(p => p.id === preset)
    if (p?.w && p?.h) return { w: p.w, h: p.h }
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
      fd.append('cropL', String(cropL))
      fd.append('cropT', String(cropT))
      fd.append('cropR', String(cropR))
      fd.append('cropB', String(cropB))
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
      <header className="bg-adipa-gradient py-8 px-4 text-center shadow-lg">
        <div className="flex items-center justify-center gap-3 mb-2">
          <ImageIcon className="text-white w-8 h-8" />
          <h1 className="text-3xl font-bold text-white tracking-tight">Optimizador de Imágenes</h1>
        </div>
        <p className="text-adipa-blue-light text-sm">Comunicaciones ADIPA · WebP · Tamaño configurable</p>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">

        {/* ── Upload / Crop preview ── */}
        {!preview ? (
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
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-adipa-navy/50 truncate max-w-[70%]">
                {file?.name} · {formatBytes(file?.size ?? 0)}
              </p>
              <button
                onClick={() => inputRef.current?.click()}
                className="flex items-center gap-1.5 text-xs font-medium text-adipa-purple hover:text-adipa-purple-deep transition-colors"
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
                onCropChange={(l, t, r, b) => { setCropL(l); setCropT(t); setCropR(r); setCropB(b) }}
              />
            ) : (
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
          ref={inputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />

        {/* ── Preset selector (grouped) ── */}
        <div className="space-y-4">
          <p className="text-sm font-semibold text-adipa-navy">Formato de salida</p>
          {PRESET_GROUPS.map((group) => (
            <div key={group.category}>
              <p className="text-xs font-semibold text-adipa-purple uppercase tracking-wider mb-2">
                {group.category}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {group.presets.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPreset(p.id)}
                    className={`rounded-xl border-2 p-3 text-left transition-all
                      ${preset === p.id
                        ? 'border-adipa-purple bg-adipa-purple text-white shadow-md shadow-adipa-purple/30'
                        : 'border-adipa-cyan/50 bg-white text-adipa-navy hover:border-adipa-purple'}`}
                  >
                    <p className="font-semibold text-sm leading-tight">{p.label}</p>
                    <p className={`text-xs mt-0.5 ${preset === p.id ? 'text-white/80' : 'text-adipa-navy/50'}`}>
                      {p.desc}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {preset === 'manual' && (
            <div className="flex items-center gap-3">
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
            <p className="text-sm font-semibold text-adipa-navy">Tamaño de salida aproximado</p>
            <span className="text-sm font-bold text-adipa-purple">{targetKB} KB</span>
          </div>
          <input
            type="range" min={20} max={100} step={5} value={targetKB}
            onChange={(e) => setTargetKB(Number(e.target.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer
              bg-gradient-to-r from-adipa-purple to-adipa-blue
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
              [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-adipa-purple
              [&::-webkit-slider-thumb]:shadow-md"
          />
          <div className="flex justify-between text-xs text-adipa-navy/40 mt-1">
            <span>20 KB</span><span>100 KB</span>
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
              {result.outputSize > targetKB * 1024 && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  No fue posible reducirla a {targetKB} KB ni al mínimo de calidad. Resultado: {formatBytes(result.outputSize)}.
                </p>
              )}
              {result.outputSize < targetKB * 1024 * 0.7 && (
                <p className="text-xs text-sky-600 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
                  La imagen a máxima calidad pesa {formatBytes(result.outputSize)} — no es posible acercarse más a {targetKB} KB sin agregar datos artificiales.
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
