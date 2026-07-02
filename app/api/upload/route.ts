import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const text = await file.text()
    const ext  = file.name.split('.').pop()?.toLowerCase() ?? ''

    // For JSON try to pretty-print relevant fields
    if (ext === 'json') {
      try {
        const parsed = JSON.parse(text)
        return NextResponse.json({ content: JSON.stringify(parsed, null, 2).slice(0, 50000), filename: file.name })
      } catch { /* fall through to raw */ }
    }

    return NextResponse.json({ content: text.slice(0, 50000), filename: file.name })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
