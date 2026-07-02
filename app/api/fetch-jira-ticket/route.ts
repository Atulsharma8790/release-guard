import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

function adfToText(node: Record<string, unknown>): string {
  if (!node || typeof node !== 'object') return ''
  if (node.type === 'text') return (node.text as string) ?? ''
  const content = node.content as Record<string, unknown>[] | undefined
  if (!content) return ''
  return content.map(adfToText).join(node.type === 'paragraph' ? '\n' : '')
}

export async function POST(req: Request) {
  try {
    const { baseUrl, email, token, issueKey } = await req.json()
    if (!baseUrl || !email || !token || !issueKey) {
      return NextResponse.json({ error: 'baseUrl, email, token and issueKey are required' }, { status: 400 })
    }

    const base = baseUrl.replace(/\/$/, '')
    const auth = Buffer.from(`${email}:${token}`).toString('base64')
    const headers = { Authorization: `Basic ${auth}`, Accept: 'application/json' }

    const res = await fetch(
      `${base}/rest/api/3/issue/${issueKey}?fields=summary,description,issuetype,priority,status,labels,fixVersions,components,comment`,
      { headers }
    )

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json({ error: err.errorMessages?.join(', ') ?? `HTTP ${res.status}` }, { status: res.status })
    }

    const issue = await res.json()
    const fields = issue.fields ?? {}

    const descText = fields.description
      ? adfToText(fields.description as Record<string, unknown>)
      : 'No description'

    const comments = (fields.comment?.comments ?? [])
      .slice(-3)
      .map((c: { author: { displayName: string }; body: unknown }) =>
        `[${c.author?.displayName}]: ${adfToText(c.body as Record<string, unknown>)}`)
      .join('\n')

    const content = [
      `JIRA ${issueKey} — ${fields.summary}`,
      `Type: ${fields.issuetype?.name ?? 'Unknown'} | Priority: ${fields.priority?.name ?? 'Unknown'} | Status: ${fields.status?.name ?? 'Unknown'}`,
      fields.fixVersions?.length ? `Fix Version: ${fields.fixVersions.map((v: { name: string }) => v.name).join(', ')}` : '',
      fields.components?.length ? `Components: ${fields.components.map((c: { name: string }) => c.name).join(', ')}` : '',
      fields.labels?.length ? `Labels: ${fields.labels.join(', ')}` : '',
      '',
      `Description:\n${descText}`,
      comments ? `\nRecent Comments:\n${comments}` : '',
    ].filter(Boolean).join('\n')

    return NextResponse.json({
      content: content.slice(0, 30000),
      meta: { issueKey, summary: fields.summary, status: fields.status?.name },
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
