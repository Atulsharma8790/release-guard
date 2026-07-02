import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: Request) {
  try {
    const { prUrl, token } = await req.json()
    if (!prUrl) return NextResponse.json({ error: 'prUrl is required' }, { status: 400 })

    // Parse GitHub PR URL: https://github.com/owner/repo/pull/123
    const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
    if (!match) return NextResponse.json({ error: 'Invalid GitHub PR URL. Expected: https://github.com/owner/repo/pull/123' }, { status: 400 })

    const [, owner, repo, prNumber] = match
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
    if (token) headers['Authorization'] = `Bearer ${token}`

    // Fetch PR details + files in parallel
    const [prRes, filesRes, commitsRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`, { headers }),
      fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`, { headers }),
      fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/commits?per_page=20`, { headers }),
    ])

    if (!prRes.ok) {
      const err = await prRes.json()
      return NextResponse.json({ error: err.message ?? `GitHub API error ${prRes.status}` }, { status: prRes.status })
    }

    const pr      = await prRes.json()
    const files   = prRes.ok && filesRes.ok ? await filesRes.json() : []
    const commits = prRes.ok && commitsRes.ok ? await commitsRes.json() : []

    const fileList = Array.isArray(files)
      ? files.map((f: { filename: string; status: string; additions: number; deletions: number }) =>
          `${f.status}: ${f.filename} (+${f.additions}/-${f.deletions})`)
      : []

    const commitMessages = Array.isArray(commits)
      ? commits.map((c: { commit: { message: string } }) => `- ${c.commit.message.split('\n')[0]}`)
      : []

    const content = [
      `PR #${prNumber} — ${pr.title}`,
      `Branch: ${pr.head?.ref} → ${pr.base?.ref}`,
      `State: ${pr.state} | Mergeable: ${pr.mergeable ?? 'unknown'}`,
      `Author: ${pr.user?.login}`,
      `Changed files: ${pr.changed_files ?? fileList.length} | Additions: +${pr.additions} | Deletions: -${pr.deletions}`,
      '',
      pr.body ? `Description:\n${pr.body}` : '',
      '',
      fileList.length > 0 ? `Files changed:\n${fileList.slice(0, 40).join('\n')}` : '',
      '',
      commitMessages.length > 0 ? `Commits:\n${commitMessages.join('\n')}` : '',
    ].filter(Boolean).join('\n')

    return NextResponse.json({
      content: content.slice(0, 50000),
      meta: { title: pr.title, prNumber, repo: `${owner}/${repo}`, filesChanged: pr.changed_files },
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
