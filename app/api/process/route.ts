import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'

interface Dims { width: number; height: number }

const PRESET_DIMS: Record<string, Dims> = {
  noticias: { width: 796,  height: 348  },
  ebooks:   { width: 1280, height: 960  },
  cuadrada: { width: 1080, height: 1080 },
}

const MAX_SIZE_BYTES = 100 * 1024 // 100 KB
const MAX_FILE_BYTES = 4 * 1024 * 1024 // 4 MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file   = formData.get('image') as File | null
    const preset = formData.get('preset') as string | null

    // cropX/cropY: 0 = left/top edge, 100 = right/bottom edge (default centre = 50)
    const cropX = Math.max(0, Math.min(100, parseFloat((formData.get('cropX') as string) ?? '50')))
    const cropY = Math.max(0, Math.min(100, parseFloat((formData.get('cropY') as string) ?? '50')))

    if (!file)   return NextResponse.json({ error: 'No se recibió ninguna imagen.' }, { status: 400 })
    if (!preset) return NextResponse.json({ error: 'Falta el parámetro preset.'    }, { status: 400 })
    if (file.size > MAX_FILE_BYTES)
      return NextResponse.json({ error: 'El archivo supera el máximo de 4 MB.' }, { status: 400 })

    const originalSize = file.size
    const buffer = Buffer.from(await file.arrayBuffer())

    // Resolve target dimensions
    let dims: Dims | null = null
    if (preset === 'manual') {
      const w = parseInt(formData.get('width')  as string ?? '0', 10)
      const h = parseInt(formData.get('height') as string ?? '0', 10)
      if (!w || !h || w < 1 || w > 10000 || h < 1 || h > 10000)
        return NextResponse.json(
          { error: 'Dimensiones manuales inválidas. Deben estar entre 1 y 10 000 px.' },
          { status: 400 }
        )
      dims = { width: w, height: h }
    } else if (preset !== 'webp-only') {
      dims = PRESET_DIMS[preset] ?? null
      if (!dims)
        return NextResponse.json({ error: 'Preset desconocido.' }, { status: 400 })
    }

    // Build Sharp pipeline
    let pipeline: sharp.Sharp

    if (dims) {
      const { width: targetW, height: targetH } = dims

      // Read original size to compute scale factor
      const meta  = await sharp(buffer).metadata()
      const origW = meta.width  ?? 1
      const origH = meta.height ?? 1

      // Scale so the image covers the target (same logic as fit:'cover')
      const scale   = Math.max(targetW / origW, targetH / origH)
      const scaledW = Math.max(targetW, Math.round(origW * scale))
      const scaledH = Math.max(targetH, Math.round(origH * scale))

      // Map cropX/Y percentage → pixel offset within the "overhang"
      const maxLeft = scaledW - targetW
      const maxTop  = scaledH - targetH
      const left    = Math.round((cropX / 100) * maxLeft)
      const top     = Math.round((cropY / 100) * maxTop)

      pipeline = sharp(buffer)
        .resize(scaledW, scaledH, { fit: 'fill' })
        .extract({ left, top, width: targetW, height: targetH })
        .sharpen({ sigma: 0.5 })
    } else {
      // webp-only: just convert, no resize/crop
      pipeline = sharp(buffer)
    }

    // Smart compression: quality 85 → 40 in steps of 5 until ≤ 100 KB
    let quality = 85
    let outputBuffer: Buffer

    do {
      outputBuffer = await pipeline.clone().webp({ quality }).toBuffer()
      if (outputBuffer.length <= MAX_SIZE_BYTES) break
      quality -= 5
    } while (quality >= 40)

    if (outputBuffer.length > MAX_SIZE_BYTES)
      outputBuffer = await pipeline.clone().webp({ quality: 40 }).toBuffer()

    return new NextResponse(new Uint8Array(outputBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/webp',
        'Content-Disposition': 'attachment; filename="optimized.webp"',
        'X-Original-Size': String(originalSize),
        'X-Output-Size':   String(outputBuffer.length),
        'X-Quality-Used':  String(Math.max(quality, 40)),
      },
    })
  } catch (err) {
    console.error('Error procesando imagen:', err)
    return NextResponse.json({ error: 'Error interno al procesar la imagen.' }, { status: 500 })
  }
}
