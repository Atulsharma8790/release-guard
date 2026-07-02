import Anthropic from '@anthropic-ai/sdk'
import { buildSystemPrompt, buildUserPrompt, type Environment } from '@/lib/prompts'

export const runtime = 'nodejs'
export const maxDuration = 120

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function send(ctrl: ReadableStreamDefaultController, data: object) {
  ctrl.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`))
}

function extractArray(chunk: string): unknown[] | null {
  const m = chunk.match(/\[[\s\S]*\]/)
  if (m) { try { const p = JSON.parse(m[0]); if (Array.isArray(p)) return p } catch { /**/ } }
  const o = chunk.match(/\{[\s\S]*\}/)
  if (o) { try { const p = JSON.parse(o[0]); if (p && typeof p === 'object') for (const v of Object.values(p)) if (Array.isArray(v)) return v as unknown[] } catch { /**/ } }
  return null
}

function extractObject(chunk: string): Record<string, unknown> | null {
  const m = chunk.match(/\{[\s\S]*\}/)
  if (m) { try { const p = JSON.parse(m[0]); if (p && !Array.isArray(p)) return p } catch { /**/ } }
  return null
}

function parseStep(chunk: string, stepIndex: number): unknown {
  if (stepIndex < 5) return extractArray(chunk) ?? { raw: chunk.trim().slice(0, 300) }
  return extractObject(chunk) ?? { raw: chunk.trim().slice(0, 300) }
}

export async function POST(req: Request) {
  const { releaseInfo, env } = await req.json() as { releaseInfo: string; env: Environment }
  if (!releaseInfo?.trim()) return new Response('No release info', { status: 400 })

  const stream = new ReadableStream({
    async start(ctrl) {
      try {
        let fullText = ''
        let currentStep = 0
        const stepStartIdx: Record<number, number> = {}

        const as = await client.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 8000,
          system: buildSystemPrompt(env ?? 'production'),
          messages: [{ role: 'user', content: buildUserPrompt(releaseInfo, env ?? 'production') }],
        })

        for await (const chunk of as) {
          if (chunk.type !== 'content_block_delta' || chunk.delta.type !== 'text_delta') continue
          const text = chunk.delta.text
          fullText += text

          for (let s = 1; s <= 7; s++) {
            const marker = `STEP_${s}_START`
            if (fullText.includes(marker) && !stepStartIdx[s]) {
              stepStartIdx[s] = fullText.indexOf(marker)
              if (s > 1) {
                const prev = s - 1
                const prevChunk = fullText.slice(
                  stepStartIdx[prev] + `STEP_${prev}_START`.length,
                  stepStartIdx[s]
                )
                send(ctrl, { type: 'step_result', step: prev, data: parseStep(prevChunk, prev - 1) })
              }
              if (s !== currentStep) {
                currentStep = s
                send(ctrl, { type: 'step_start', step: currentStep })
              }
            }
          }

          send(ctrl, { type: 'token', text, step: currentStep })
        }

        if (stepStartIdx[7]) {
          const lastChunk = fullText.slice(stepStartIdx[7] + 'STEP_7_START'.length)
          send(ctrl, { type: 'step_result', step: 7, data: parseStep(lastChunk, 6) })
        }

        send(ctrl, { type: 'complete' })
      } catch (e: unknown) {
        send(ctrl, { type: 'error', message: e instanceof Error ? e.message : 'Unknown error' })
      } finally {
        ctrl.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  })
}
