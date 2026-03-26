import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'

const PRESETS: Record<string, { width: number; height: number } | null> = {
  noticias:  { width: 796,  height: 348  },
  ebooks:    { width: 1280, height: 960  },
  cuadrada:  { width: 1080, height: 1080 },
  'webp-only': null,
}

const MAX_SIZE_BYTES = 100 * 1024 // 100 KB
const MAX_FILE_BYTES = 4 * 1024 * 1024 // 4 MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('image') as File | null
    const preset = formData.get('preset') as string | null
    const customWidth = formData.get('width') as string | null
    const customHeight = formData.get('height') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No se recibió ninguna imagen.' }, { status: 400 })
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'El archivo supera el máximo de 4 MB.' }, { status: 400 })
    }

    if (!preset) {
      return NextResponse.json({ error: 'Falta el parámetro preset.' }, { status: 400 })
    }

    const originalSize = file.size
    const buffer = Buffer.from(await file.arrayBuffer())

    let pipeline = sharp(buffer)

    if (preset === 'manual') {
      const w = parseInt(customWidth ?? '0', 10)
      const h = parseInt(customHeight ?? '0', 10)

      if (!w || !h || w < 1 || w > 10000 || h < 1 || h > 10000) {
        return NextResponse.json(
          { error: 'Dimensiones manuales inválidas. Deben estar entre 1 y 10 000 px.' },
          { status: 400 }
        )
      }

      pipeline = pipeline
        .resize(w, h, { fit: 'cover', position: 'centre' })
        .sharpen({ sigma: 0.5 })
    } else if (preset === 'webp-only') {
      // No resize, just convert and compress
    } else {
      const dims = PRESETS[preset]
      if (!dims) {
        return NextResponse.json({ error: 'Preset desconocido.' }, { status: 400 })
      }
      pipeline = pipeline
        .resize(dims.width, dims.height, { fit: 'cover', position: 'centre' })
        .sharpen({ sigma: 0.5 })
    }

    // Smart compression: start at quality 85, step down by 5 until under 100 KB
    let quality = 85
    let outputBuffer: Buffer

    do {
      outputBuffer = await pipeline.clone().webp({ quality }).toBuffer()
      if (outputBuffer.length <= MAX_SIZE_BYTES) break
      quality -= 5
    } while (quality >= 40)

    // If still over limit at quality 40, use quality 40 anyway
    if (outputBuffer.length > MAX_SIZE_BYTES) {
      outputBuffer = await pipeline.clone().webp({ quality: 40 }).toBuffer()
    }

    return new NextResponse(new Uint8Array(outputBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/webp',
        'Content-Disposition': 'attachment; filename="optimized.webp"',
        'X-Original-Size': String(originalSize),
        'X-Output-Size': String(outputBuffer.length),
        'X-Quality-Used': String(quality < 40 ? 40 : quality),
      },
    })
  } catch (err) {
    console.error('Error procesando imagen:', err)
    return NextResponse.json(
      { error: 'Error interno al procesar la imagen.' },
      { status: 500 }
    )
  }
}
