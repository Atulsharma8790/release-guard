'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Environment } from '@/lib/prompts'
import { EXAMPLES } from '@/lib/examples'

const ENV_CONFIG: Record<Environment, { label: string; icon: string; active: string; desc: string }> = {
  staging:    { label: 'Staging',    icon: '🧪', active: 'border-blue-500/60 bg-blue-500/10 text-blue-300',   desc: 'Relaxed thresholds — built to catch issues early' },
  production: { label: 'Production', icon: '🚀', active: 'border-rose-500/60 bg-rose-500/10 text-rose-300',   desc: 'Strict thresholds — every risk scrutinised' },
  hotfix:     { label: 'Hotfix',     icon: '⚡', active: 'border-amber-500/60 bg-amber-500/10 text-amber-300', desc: 'Speed-focused — narrow scope, fast gate' },
}

type EnrichPanel = 'github' | 'jira' | null

export default function Home() {
  const router = useRouter()

  // Auth
  const [passcode, setPasscode] = useState('')
  const [authed, setAuthed]     = useState(false)
  const [authErr, setAuthErr]   = useState('')
  const [checking, setChecking] = useState(false)

  // Core
  const [env, setEnv]                 = useState<Environment>('production')
  const [releaseInfo, setReleaseInfo] = useState('')
  const [starting, setStarting]       = useState(false)
  const [inputMode, setInputMode]     = useState<'paste' | 'file'>('paste')
  const [uploading, setUploading]     = useState(false)
  const [uploadedFile, setUploadedFile] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Enrichment panels
  const [openPanel, setOpenPanel]     = useState<EnrichPanel>(null)
  const [enrichedParts, setEnrichedParts] = useState<{ label: string; content: string }[]>([])

  // GitHub state
  const [ghUrl, setGhUrl]     = useState('')
  const [ghToken, setGhToken] = useState('')
  const [ghLoading, setGhLoading] = useState(false)
  const [ghErr, setGhErr]     = useState('')

  // JIRA state
  const [jiraBase, setJiraBase]       = useState('')
  const [jiraEmail, setJiraEmail]     = useState('')
  const [jiraToken, setJiraToken]     = useState('')
  const [jiraKey, setJiraKey]         = useState('')
  const [jiraLoading, setJiraLoading] = useState(false)
  const [jiraErr, setJiraErr]         = useState('')

  async function checkPasscode() {
    setChecking(true); setAuthErr('')
    const res = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passcode }) })
    if (res.ok) setAuthed(true); else setAuthErr('Incorrect passcode')
    setChecking(false)
  }

  async function handleFileUpload(file: File) {
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: form })
    const data = await res.json()
    if (res.ok) {
      setReleaseInfo(data.content)
      setUploadedFile(file.name)
      setInputMode('paste')
    }
    setUploading(false)
  }

  function removeEnriched(label: string) {
    setEnrichedParts(p => p.filter(e => e.label !== label))
  }

  function addEnriched(label: string, content: string) {
    setEnrichedParts(p => {
      const without = p.filter(e => e.label !== label)
      return [...without, { label, content }]
    })
    setOpenPanel(null)
  }

  async function fetchGitHub() {
    setGhLoading(true); setGhErr('')
    const res = await fetch('/api/fetch-pr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prUrl: ghUrl, token: ghToken || undefined }),
    })
    const data = await res.json()
    if (res.ok) addEnriched(`GitHub PR: ${data.meta?.title ?? ghUrl}`, data.content)
    else setGhErr(data.error ?? 'Failed to fetch PR')
    setGhLoading(false)
  }

  async function fetchJira() {
    setJiraLoading(true); setJiraErr('')
    const res = await fetch('/api/fetch-jira-ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: jiraBase, email: jiraEmail, token: jiraToken, issueKey: jiraKey }),
    })
    const data = await res.json()
    if (res.ok) addEnriched(`JIRA ${jiraKey}: ${data.meta?.summary ?? ''}`, data.content)
    else setJiraErr(data.error ?? 'Failed to fetch ticket')
    setJiraLoading(false)
  }

  function startGate() {
    const combined = [
      releaseInfo.trim(),
      ...enrichedParts.map(e => `\n--- ${e.label} ---\n${e.content}`),
    ].filter(Boolean).join('\n\n')
    if (!combined) return
    setStarting(true)
    sessionStorage.setItem('rg_release', combined)
    sessionStorage.setItem('rg_env', env)
    router.push('/gate')
  }

  const hasContent = releaseInfo.trim() || enrichedParts.length > 0

  // ── AUTH SCREEN ──────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 font-black">RG</div>
            <div>
              <h1 className="font-black text-white text-lg">ReleaseGuard</h1>
              <p className="text-slate-500 text-xs">ShipMind — Agentic Release Gate</p>
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <p className="text-slate-400 text-sm mb-4">Enter passcode to access</p>
            <input type="password" value={passcode} onChange={e => setPasscode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && checkPasscode()} placeholder="Passcode"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors mb-3" />
            {authErr && <p className="text-red-400 text-xs mb-3">{authErr}</p>}
            <button onClick={checkPasscode} disabled={checking || !passcode}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold py-3 rounded-xl transition-colors">
              {checking ? 'Checking…' : 'Enter →'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── MAIN SCREEN ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-black text-sm">RG</div>
        <span className="font-black">ReleaseGuard</span>
        <span className="text-slate-500 text-sm">/ ShipMind</span>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">

        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-white mb-2">Should you ship?</h1>
          <p className="text-slate-400 text-sm">7-step agentic analysis — GO / NO-GO / GO-WITH-CONDITIONS verdict backed by evidence.</p>
        </div>

        {/* ── Environment selector ─────────────────────────────────────────── */}
        <div className="mb-7">
          <p className="text-slate-500 text-xs uppercase tracking-widest mb-3">Deployment target</p>
          <div className="grid grid-cols-3 gap-3">
            {(Object.entries(ENV_CONFIG) as [Environment, typeof ENV_CONFIG[Environment]][]).map(([key, cfg]) => (
              <button key={key} onClick={() => setEnv(key)}
                className={`rounded-xl border p-4 text-left transition-all ${env === key ? cfg.active : 'border-slate-800 bg-slate-900/50 text-slate-500 hover:border-slate-700'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xl">{cfg.icon}</span>
                  {env === key && (
                    <button
                      onClick={e => { e.stopPropagation(); setReleaseInfo(EXAMPLES[key]) }}
                      className="text-xs bg-slate-700/60 hover:bg-slate-600 text-slate-300 px-2 py-0.5 rounded transition-colors">
                      Load example
                    </button>
                  )}
                </div>
                <p className="font-bold text-sm">{cfg.label}</p>
                <p className="text-xs mt-1 opacity-60 leading-tight">{cfg.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* ── Section 1: Primary input ─────────────────────────────────────── */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-500 text-xs uppercase tracking-widest">Release information</p>
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
              <button onClick={() => setInputMode('paste')}
                className={`text-xs px-3 py-1 rounded-md transition-colors ${inputMode === 'paste' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                ✏️ Paste
              </button>
              <button onClick={() => { setInputMode('file'); setTimeout(() => fileRef.current?.click(), 50) }}
                className={`text-xs px-3 py-1 rounded-md transition-colors ${inputMode === 'file' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                📂 Upload file
              </button>
            </div>
          </div>

          <input ref={fileRef} type="file" className="hidden"
            accept=".txt,.md,.json,.yaml,.yml,.log,.csv,.xml"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = '' }} />

          {uploadedFile && (
            <div className="flex items-center gap-2 mb-2 text-xs text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-3 py-2">
              <span>📄 {uploadedFile}</span>
              <button onClick={() => { setUploadedFile(null); setReleaseInfo('') }} className="ml-auto text-slate-500 hover:text-slate-300">✕</button>
            </div>
          )}

          {uploading ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl px-5 py-10 text-center">
              <span className="inline-block w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full spin-slow" />
              <p className="text-slate-500 text-sm mt-3">Reading file…</p>
            </div>
          ) : (
            <textarea value={releaseInfo} onChange={e => setReleaseInfo(e.target.value)}
              placeholder={`Paste PR description, commit messages, changelog, release notes, diff summary…

Not sure what to paste? Select an environment above and click "Load example" to see a realistic scenario.`}
              rows={10}
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 text-slate-200 placeholder-slate-600 text-sm focus:outline-none focus:border-indigo-500 transition-colors resize-none leading-relaxed"
            />
          )}
        </div>

        {/* ── Enriched parts badges ────────────────────────────────────────── */}
        {enrichedParts.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {enrichedParts.map(e => (
              <span key={e.label} className="flex items-center gap-2 text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-3 py-1.5 rounded-lg">
                ✓ {e.label}
                <button onClick={() => removeEnriched(e.label)} className="text-slate-500 hover:text-slate-300 ml-1">✕</button>
              </span>
            ))}
          </div>
        )}

        {/* ── Section 2: Enrichment panels ─────────────────────────────────── */}
        <div className="mb-7 space-y-2">
          <p className="text-slate-600 text-xs uppercase tracking-widest">Add more context (optional — all sources combine)</p>

          {/* GitHub PR */}
          <EnrichAccordion
            icon="🐙"
            label="GitHub Pull Request"
            sublabel="Auto-fetch PR description, changed files and commit history"
            open={openPanel === 'github'}
            onToggle={() => setOpenPanel(p => p === 'github' ? null : 'github')}
            added={enrichedParts.some(e => e.label.startsWith('GitHub PR'))}
          >
            <div className="space-y-3">
              <Field label="PR URL" value={ghUrl} onChange={setGhUrl} placeholder="https://github.com/org/repo/pull/123" />
              <Field label="Personal access token (optional — needed for private repos)" value={ghToken} onChange={setGhToken} placeholder="ghp_…" type="password" />
              {ghErr && <p className="text-red-400 text-xs">{ghErr}</p>}
              <button onClick={fetchGitHub} disabled={ghLoading || !ghUrl}
                className="bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-xl transition-colors flex items-center gap-2">
                {ghLoading ? <><span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full spin-slow" /> Fetching…</> : '🐙 Fetch PR'}
              </button>
            </div>
          </EnrichAccordion>

          {/* JIRA */}
          <EnrichAccordion
            icon="🎯"
            label="JIRA Release Ticket"
            sublabel="Pull ticket description, fix version, components and comments"
            open={openPanel === 'jira'}
            onToggle={() => setOpenPanel(p => p === 'jira' ? null : 'jira')}
            added={enrichedParts.some(e => e.label.startsWith('JIRA'))}
          >
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="JIRA Base URL" value={jiraBase} onChange={setJiraBase} placeholder="https://company.atlassian.net" />
              <Field label="Email" value={jiraEmail} onChange={setJiraEmail} placeholder="you@company.com" />
              <Field label="API Token" value={jiraToken} onChange={setJiraToken} placeholder="ATATT3x…" type="password" />
              <Field label="Issue Key" value={jiraKey} onChange={setJiraKey} placeholder="PROJ-123" />
            </div>
            {jiraErr && <p className="text-red-400 text-xs mt-2">{jiraErr}</p>}
            <button onClick={fetchJira} disabled={jiraLoading || !jiraBase || !jiraEmail || !jiraToken || !jiraKey}
              className="mt-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-xl transition-colors flex items-center gap-2">
              {jiraLoading ? <><span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full spin-slow" /> Fetching…</> : '🎯 Fetch Ticket'}
            </button>
          </EnrichAccordion>
        </div>

        {/* ── CTA ──────────────────────────────────────────────────────────── */}
        <button onClick={startGate} disabled={starting || !hasContent}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-black text-lg py-4 rounded-2xl transition-colors flex items-center justify-center gap-3">
          {starting
            ? <><span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full spin-slow" /> Starting gate…</>
            : <>🚦 Run Release Gate — {ENV_CONFIG[env].icon} {ENV_CONFIG[env].label}</>}
        </button>
        <p className="text-center text-slate-600 text-xs mt-3">More context = more accurate verdict. All sources are combined before analysis.</p>
      </main>
    </div>
  )
}

function EnrichAccordion({ icon, label, sublabel, open, onToggle, added, children }: {
  icon: string; label: string; sublabel: string; open: boolean; onToggle: () => void; added: boolean; children: React.ReactNode
}) {
  return (
    <div className={`rounded-xl border transition-all ${open ? 'border-indigo-500/40 bg-indigo-500/5' : added ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-800 bg-slate-900/50'}`}>
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <span className="text-lg">{icon}</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">{label}</p>
          <p className="text-xs text-slate-500">{sublabel}</p>
        </div>
        {added && <span className="text-xs text-emerald-400 font-bold shrink-0">✓ Added</span>}
        <span className="text-slate-600 text-sm ml-2">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-4 pb-4 border-t border-slate-800 pt-4">{children}</div>}
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: string
}) {
  return (
    <div>
      <label className="text-slate-500 text-xs mb-1 block">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors" />
    </div>
  )
}
