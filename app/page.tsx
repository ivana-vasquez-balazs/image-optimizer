'use client'

import { useState, useCallback, useRef } from 'react'
import { Upload, ImageIcon, Download, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'

type Preset = 'noticias' | 'ebooks' | 'cuadrada' | 'webp-only' | 'manual'

interface PresetOption {
  id: Preset
  label: string
  desc: string
}

const PRESETS: PresetOption[] = [
  { id: 'noticias',  label: 'Noticias',        desc: '796 × 348 px' },
  { id: 'ebooks',    label: 'Ebooks / Recursos', desc: '1280 × 960 px' },
  { id: 'cuadrada',  label: 'Cuadrada',         desc: '1080 × 1080 px' },
  { id: 'webp-only', label: 'Solo comprimir',   desc: 'Sin redimensionar' },
  { id: 'manual',    label: 'Personalizado',    desc: 'Tamaño manual' },
]

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [preset, setPreset] = useState<Preset>('noticias')
  const [customW, setCustomW] = useState('')
  const [customH, setCustomH] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    url: string
    originalSize: number
    outputSize: number
    quality: number
  } | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((f: File) => {
    setError(null)
    setResult(null)

    if (!f.type.startsWith('image/')) {
      setError('El archivo debe ser una imagen.')
      return
    }
    if (f.size > 4 * 1024 * 1024) {
      setError('El archivo supera el límite de 4 MB.')
      return
    }

    setFile(f)
    const reader = new FileReader()
    reader.onload = (e) => setPreview(e.target?.result as string)
    reader.readAsDataURL(f)
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const dropped = e.dataTransfer.files[0]
      if (dropped) handleFile(dropped)
    },
    [handleFile]
  )

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) handleFile(selected)
  }

  const handleProcess = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const fd = new FormData()
      fd.append('image', file)
      fd.append('preset', preset)
      if (preset === 'manual') {
        fd.append('width', customW)
        fd.append('height', customH)
      }

      const res = await fetch('/api/process', { method: 'POST', body: fd })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Error al procesar la imagen.')
        return
      }

      const originalSize = parseInt(res.headers.get('X-Original-Size') ?? '0', 10)
      const outputSize   = parseInt(res.headers.get('X-Output-Size')   ?? '0', 10)
      const quality      = parseInt(res.headers.get('X-Quality-Used')  ?? '85', 10)

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)

      setResult({ url, originalSize, outputSize, quality })
    } catch {
      setError('Error de red al conectar con el servidor.')
    } finally {
      setLoading(false)
    }
  }

  const reduction = result
    ? Math.round((1 - result.outputSize / result.originalSize) * 100)
    : 0

  return (
    <main className="min-h-screen bg-adipa-bg-light">
      {/* Header */}
      <header className="bg-adipa-gradient py-8 px-4 text-center shadow-lg">
        <div className="flex items-center justify-center gap-3 mb-2">
          <ImageIcon className="text-white w-8 h-8" />
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Optimizador de Imágenes
          </h1>
        </div>
        <p className="text-adipa-blue-light text-sm">
          Comunicaciones ADIPA · WebP · Máximo 100 KB
        </p>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">

        {/* Upload zone */}
        <div
          className={`rounded-2xl border-2 border-dashed transition-all cursor-pointer select-none
            ${isDragging
              ? 'border-adipa-purple bg-adipa-purple-light scale-[1.01]'
              : 'border-adipa-cyan bg-white hover:border-adipa-purple hover:bg-adipa-purple-light/30'
            }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onInputChange}
          />

          {preview ? (
            <div className="p-4 flex flex-col items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="Vista previa"
                className="max-h-56 rounded-xl object-contain shadow"
              />
              <p className="text-xs text-adipa-navy/60 mt-1">
                {file?.name} · {formatBytes(file?.size ?? 0)}
              </p>
              <p className="text-xs text-adipa-purple font-medium">
                Clic para cambiar imagen
              </p>
            </div>
          ) : (
            <div className="py-16 flex flex-col items-center gap-3 text-adipa-navy/50">
              <Upload className="w-10 h-10 text-adipa-purple" />
              <p className="font-semibold text-adipa-navy">
                Arrastrá o hacé clic para subir
              </p>
              <p className="text-sm">PNG, JPG, WEBP · Máx. 4 MB</p>
            </div>
          )}
        </div>

        {/* Preset selector */}
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
                    : 'border-adipa-cyan/50 bg-white text-adipa-navy hover:border-adipa-purple'
                  }`}
              >
                <p className="font-semibold text-sm">{p.label}</p>
                <p className={`text-xs mt-0.5 ${preset === p.id ? 'text-white/80' : 'text-adipa-navy/50'}`}>
                  {p.desc}
                </p>
              </button>
            ))}
          </div>

          {/* Manual dimensions */}
          {preset === 'manual' && (
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1">
                <label className="text-xs text-adipa-navy/60 block mb-1">Ancho (px)</label>
                <input
                  type="number"
                  value={customW}
                  onChange={(e) => setCustomW(e.target.value)}
                  placeholder="ej. 800"
                  min={1}
                  max={10000}
                  className="w-full rounded-lg border border-adipa-cyan px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-adipa-purple"
                />
              </div>
              <span className="text-adipa-navy/40 mt-5">×</span>
              <div className="flex-1">
                <label className="text-xs text-adipa-navy/60 block mb-1">Alto (px)</label>
                <input
                  type="number"
                  value={customH}
                  onChange={(e) => setCustomH(e.target.value)}
                  placeholder="ej. 600"
                  min={1}
                  max={10000}
                  className="w-full rounded-lg border border-adipa-cyan px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-adipa-purple"
                />
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Process button */}
        <button
          onClick={handleProcess}
          disabled={!file || loading}
          className="w-full py-3 rounded-xl font-semibold text-white bg-adipa-gradient
            disabled:opacity-40 disabled:cursor-not-allowed
            hover:opacity-90 active:scale-[0.99] transition-all shadow-lg shadow-adipa-purple/30
            flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Procesando…
            </>
          ) : (
            <>
              <ImageIcon className="w-5 h-5" />
              Optimizar imagen
            </>
          )}
        </button>

        {/* Result */}
        {result && (
          <div className="bg-white rounded-2xl border border-adipa-purple-light shadow-sm overflow-hidden">
            <div className="bg-adipa-gradient px-4 py-3 flex items-center gap-2">
              <CheckCircle2 className="text-white w-5 h-5" />
              <span className="text-white font-semibold">Imagen optimizada</span>
            </div>

            <div className="p-5 space-y-4">
              {/* Preview */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result.url}
                alt="Resultado"
                className="w-full max-h-60 object-contain rounded-xl bg-adipa-bg-light"
              />

              {/* Stats */}
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

              {/* Download */}
              <a
                href={result.url}
                download="optimized.webp"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl
                  bg-adipa-gradient text-white font-semibold shadow-md shadow-adipa-purple/30
                  hover:opacity-90 transition-all"
              >
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
