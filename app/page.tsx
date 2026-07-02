'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Environment } from '@/lib/prompts'

const ENV_CONFIG: Record<Environment, { label: string; icon: string; color: string; desc: string }> = {
  staging:    { label: 'Staging',    icon: '🧪', color: 'border-blue-500/50 bg-blue-500/10 text-blue-400',   desc: 'Relaxed thresholds — built for catching issues' },
  production: { label: 'Production', icon: '🚀', color: 'border-rose-500/50 bg-rose-500/10 text-rose-400',   desc: 'Strict thresholds — every risk is scrutinised' },
  hotfix:     { label: 'Hotfix',     icon: '⚡', color: 'border-amber-500/50 bg-amber-500/10 text-amber-400', desc: 'Speed-focused — narrow scope, fast gate' },
}

export default function Home() {
  const router = useRouter()
  const [passcode, setPasscode]       = useState('')
  const [authed, setAuthed]           = useState(false)
  const [authErr, setAuthErr]         = useState('')
  const [checking, setChecking]       = useState(false)
  const [env, setEnv]                 = useState<Environment>('production')
  const [releaseInfo, setReleaseInfo] = useState('')
  const [starting, setStarting]       = useState(false)

  async function checkPasscode() {
    setChecking(true); setAuthErr('')
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode }),
    })
    if (res.ok) { setAuthed(true) } else { setAuthErr('Incorrect passcode') }
    setChecking(false)
  }

  function startGate() {
    if (!releaseInfo.trim()) return
    setStarting(true)
    sessionStorage.setItem('rg_release', releaseInfo)
    sessionStorage.setItem('rg_env', env)
    router.push('/gate')
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 font-black">RG</div>
            <div>
              <h1 className="font-black text-white">ReleaseGuard</h1>
              <p className="text-slate-500 text-xs">ShipMind — Agentic Release Gate</p>
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <p className="text-slate-400 text-sm mb-4">Enter passcode to access</p>
            <input
              type="password"
              value={passcode}
              onChange={e => setPasscode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && checkPasscode()}
              placeholder="Passcode"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors mb-3"
            />
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

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-black text-sm">RG</div>
        <span className="font-black">ReleaseGuard</span>
        <span className="text-slate-500 text-sm">/ ShipMind</span>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-12">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black text-white mb-3">Should you ship?</h1>
          <p className="text-slate-400">7-step agentic analysis gives you a GO / NO-GO verdict backed by evidence — not gut feel.</p>
        </div>

        {/* Environment selector */}
        <div className="mb-8">
          <p className="text-slate-500 text-xs uppercase tracking-widest mb-3">Deployment target</p>
          <div className="grid grid-cols-3 gap-3">
            {(Object.entries(ENV_CONFIG) as [Environment, typeof ENV_CONFIG[Environment]][]).map(([key, cfg]) => (
              <button key={key} onClick={() => setEnv(key)}
                className={`rounded-xl border p-4 text-left transition-all ${env === key ? cfg.color : 'border-slate-800 bg-slate-900/50 text-slate-500 hover:border-slate-700'}`}>
                <p className="text-xl mb-1">{cfg.icon}</p>
                <p className="font-bold text-sm">{cfg.label}</p>
                <p className="text-xs mt-1 opacity-70 leading-tight">{cfg.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Release info textarea */}
        <div className="mb-6">
          <p className="text-slate-500 text-xs uppercase tracking-widest mb-3">Release information</p>
          <textarea
            value={releaseInfo}
            onChange={e => setReleaseInfo(e.target.value)}
            placeholder={`Paste anything: PR description, commit messages, changelog, release notes, JIRA ticket, diff summary...

Example:
PR #342 — Migrate payment service to Stripe v3 API
- Updated stripe SDK from 3.2 to 5.1
- Refactored PaymentController (300 lines changed)
- Added webhook retry logic
- Removed legacy PayPal fallback
- 12 tests added, 3 modified`}
            rows={12}
            className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 text-slate-200 placeholder-slate-600 text-sm focus:outline-none focus:border-indigo-500 transition-colors resize-none leading-relaxed"
          />
          <p className="text-slate-600 text-xs mt-2">More context (files changed, test counts, linked tickets) = more accurate verdict.</p>
        </div>

        <button onClick={startGate} disabled={starting || !releaseInfo.trim()}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-black text-lg py-4 rounded-2xl transition-colors flex items-center justify-center gap-3">
          {starting
            ? <><span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full spin-slow" /> Starting gate…</>
            : <>🚦 Run Release Gate — {ENV_CONFIG[env].label}</>}
        </button>
      </main>
    </div>
  )
}
