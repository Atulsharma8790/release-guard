'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GATE_STEPS, type Environment } from '@/lib/prompts'

type ChangeArea    = { area: string; changeType: string; riskSurface: string; files: string[] }
type Regression    = { feature: string; regressionRisk: string; reason: string; affectedUsers: string }
type Coverage      = { area: string; coverageEstimate: string; gaps: string[]; verdict: string }
type Dependency    = { dependency: string; direction: string; risk: string; detail: string }
type Rollback      = { rollbackFeasible: boolean; estimatedTime: string; complexity: string; blockers: string[]; runbookSteps: string[] }
type RiskScore     = { changeRisk: number; regressionRisk: number; coverageRisk: number; dependencyRisk: number; rollbackRisk: number; overallScore: number; overallLabel: string }
type Verdict       = { verdict: 'GO' | 'NO-GO' | 'GO-WITH-CONDITIONS'; confidence: number; summary: string; conditions: string[]; blockers: string[]; slackMessage: string; rollbackRunbook: string[] }

type StepData = { 1?: ChangeArea[]; 2?: Regression[]; 3?: Coverage[]; 4?: Dependency[]; 5?: Rollback; 6?: RiskScore; 7?: Verdict }

const RISK_COLOR: Record<string, string> = {
  low:      'text-emerald-400 bg-emerald-500/20 border-emerald-500/30',
  medium:   'text-yellow-400 bg-yellow-500/20 border-yellow-500/30',
  high:     'text-orange-400 bg-orange-500/20 border-orange-500/30',
  critical: 'text-red-400 bg-red-500/20 border-red-500/30',
}
const VERDICT_CONFIG = {
  'GO':                   { color: 'bg-emerald-500', border: 'border-emerald-500/50', text: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: '✅', label: 'GO' },
  'NO-GO':                { color: 'bg-red-500',     border: 'border-red-500/50',     text: 'text-red-400',     bg: 'bg-red-500/10',     icon: '🛑', label: 'NO-GO' },
  'GO-WITH-CONDITIONS':   { color: 'bg-amber-500',   border: 'border-amber-500/50',   text: 'text-amber-400',   bg: 'bg-amber-500/10',   icon: '⚡', label: 'GO WITH CONDITIONS' },
}

const SCORE_DIMS = [
  { key: 'changeRisk',     label: 'Change' },
  { key: 'regressionRisk', label: 'Regression' },
  { key: 'coverageRisk',   label: 'Coverage' },
  { key: 'dependencyRisk', label: 'Dependencies' },
  { key: 'rollbackRisk',   label: 'Rollback' },
] as const

export default function GatePage() {
  const router = useRouter()
  const [activeStep, setActiveStep]    = useState(0)
  const [completedSteps, setCompleted] = useState<number[]>([])
  const [stepData, setStepData]        = useState<StepData>({})
  const [done, setDone]                = useState(false)
  const [error, setError]              = useState('')
  const [pinnedTab, setPinnedTab]      = useState<number | null>(null)
  const [slackCopied, setSlackCopied]  = useState(false)
  const [env, setEnv]                  = useState<Environment>('production')

  const liveBoxRefs   = useRef<Record<number, HTMLPreElement | null>>({})
  const liveTextAccum = useRef<Record<number, string>>({})
  const sseBuffer     = useRef('')
  const abortRef      = useRef<AbortController | null>(null)

  const displayTab = pinnedTab ?? activeStep

  useEffect(() => {
    const info = sessionStorage.getItem('rg_release')
    const e    = sessionStorage.getItem('rg_env') as Environment | null
    if (!info) { router.push('/'); return }
    setEnv(e ?? 'production')
    runGate(info, e ?? 'production')
    return () => abortRef.current?.abort()
  }, [])

  async function runGate(releaseInfo: string, environment: Environment) {
    abortRef.current = new AbortController()
    try {
      const res = await fetch('/api/gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ releaseInfo, env: environment }),
        signal: abortRef.current.signal,
      })

      const reader = res.body!.getReader()
      const dec    = new TextDecoder()

      while (true) {
        const { done: d, value } = await reader.read()
        if (d) break

        sseBuffer.current += dec.decode(value, { stream: true })
        const parts = sseBuffer.current.split('\n\n')
        sseBuffer.current = parts.pop() ?? ''

        for (const part of parts) {
          const line = part.split('\n').find(l => l.startsWith('data: '))
          if (!line) continue
          try {
            const data = JSON.parse(line.slice(6))

            if (data.type === 'step_start') {
              setActiveStep(data.step)
              setPinnedTab(null)
            }

            if (data.type === 'token') {
              const s = data.step ?? 0
              liveTextAccum.current[s] = (liveTextAccum.current[s] ?? '') + data.text
              const el = liveBoxRefs.current[s]
              if (el) {
                el.textContent += data.text
                const c = el.parentElement
                if (c) c.scrollTop = c.scrollHeight
              }
            }

            if (data.type === 'step_result') {
              const s = data.step as keyof StepData
              setStepData(prev => ({ ...prev, [s]: data.data }))
              setCompleted(prev => prev.includes(data.step) ? prev : [...prev, data.step])
            }

            if (data.type === 'complete') {
              setDone(true)
              setActiveStep(0)
              setPinnedTab(prev => prev !== null ? prev : 7)
            }

            if (data.type === 'error') setError(data.message)
          } catch { /* skip malformed */ }
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message)
    }
  }

  function copySlack() {
    const v = stepData[7] as Verdict | undefined
    if (!v?.slackMessage) return
    navigator.clipboard.writeText(v.slackMessage)
    setSlackCopied(true)
    setTimeout(() => setSlackCopied(false), 2000)
  }

  const verdict = stepData[7] as Verdict | undefined
  const score   = stepData[6] as RiskScore | undefined
  const vc      = verdict ? VERDICT_CONFIG[verdict.verdict] : null

  // ── STEP CONTENT ────────────────────────────────────────────────────────────
  function StepContent({ stepNum }: { stepNum: number }) {
    const isComplete = completedSteps.includes(stepNum)
    const isActive   = activeStep === stepNum

    if (!isComplete && !isActive) {
      return (
        <div className="text-center py-16 text-slate-600">
          <p className="text-4xl mb-3">⏳</p>
          <p>Waiting for gate to reach this step…</p>
        </div>
      )
    }

    if (isActive && !isComplete) {
      return (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-block w-3 h-3 rounded-full bg-indigo-500 blink" />
            <span className="text-indigo-400 font-bold text-sm">Agent is running this check…</span>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 h-64 overflow-y-auto">
            <pre ref={el => { liveBoxRefs.current[stepNum] = el }}
              className="font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed" />
            <span className="inline-block w-2 h-4 bg-indigo-500 blink ml-0.5 align-text-bottom" />
          </div>
          <p className="text-slate-600 text-xs mt-2">Live output from ShipMind — structured results appear when this step completes</p>
        </div>
      )
    }

    // Step 1 — Change Areas
    if (stepNum === 1) {
      const data = stepData[1]
      if (!Array.isArray(data)) return <RawFallback step={stepNum} />
      return (
        <div className="space-y-3 fade-slide-in">
          {data.map((item, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white font-bold">{item.area}</span>
                <span className={`text-xs px-2 py-0.5 rounded font-mono border ${RISK_COLOR[item.riskSurface?.toLowerCase()] ?? 'text-slate-400 bg-slate-800 border-slate-700'}`}>{item.changeType}</span>
              </div>
              <p className="text-slate-400 text-sm mb-2">{item.riskSurface}</p>
              <div className="flex flex-wrap gap-1">
                {item.files?.map((f, j) => <span key={j} className="text-xs font-mono bg-slate-800 text-slate-500 px-2 py-0.5 rounded">{f}</span>)}
              </div>
            </div>
          ))}
        </div>
      )
    }

    // Step 2 — Regressions
    if (stepNum === 2) {
      const data = stepData[2]
      if (!Array.isArray(data)) return <RawFallback step={stepNum} />
      return (
        <div className="space-y-3 fade-slide-in">
          {data.map((item, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-start gap-4">
              <span className={`text-xs font-bold px-2 py-1 rounded border shrink-0 ${RISK_COLOR[item.regressionRisk]}`}>{item.regressionRisk}</span>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold">{item.feature}</p>
                <p className="text-slate-400 text-sm mt-1">{item.reason}</p>
                <p className="text-slate-600 text-xs mt-1">Affected users: {item.affectedUsers}</p>
              </div>
            </div>
          ))}
        </div>
      )
    }

    // Step 3 — Coverage
    if (stepNum === 3) {
      const data = stepData[3]
      if (!Array.isArray(data)) return <RawFallback step={stepNum} />
      const COVER_COLOR: Record<string, string> = { adequate: 'text-emerald-400', partial: 'text-yellow-400', missing: 'text-red-400' }
      return (
        <div className="space-y-3 fade-slide-in">
          {data.map((item, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white font-semibold">{item.area}</span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 text-xs">{item.coverageEstimate}</span>
                  <span className={`text-xs font-bold ${COVER_COLOR[item.verdict]}`}>{item.verdict}</span>
                </div>
              </div>
              {item.gaps?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {item.gaps.map((g, j) => <span key={j} className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded">{g}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )
    }

    // Step 4 — Dependencies
    if (stepNum === 4) {
      const data = stepData[4]
      if (!Array.isArray(data)) return <RawFallback step={stepNum} />
      return (
        <div className="space-y-3 fade-slide-in">
          {data.map((item, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-start gap-4">
              <div className="flex flex-col items-center gap-1 shrink-0">
                <span className={`text-xs font-bold px-2 py-1 rounded border ${RISK_COLOR[item.risk]}`}>{item.risk}</span>
                <span className="text-slate-600 text-xs">{item.direction}</span>
              </div>
              <div>
                <p className="text-white font-mono font-semibold">{item.dependency}</p>
                <p className="text-slate-400 text-sm mt-1">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )
    }

    // Step 5 — Rollback
    if (stepNum === 5) {
      const data = stepData[5] as Rollback | undefined
      if (!data || Array.isArray(data)) return <RawFallback step={stepNum} />
      return (
        <div className="space-y-4 fade-slide-in">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
              <p className={`text-2xl font-black ${data.rollbackFeasible ? 'text-emerald-400' : 'text-red-400'}`}>{data.rollbackFeasible ? '✓' : '✗'}</p>
              <p className="text-slate-500 text-xs mt-1">Feasible</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
              <p className="text-white font-black">{data.estimatedTime}</p>
              <p className="text-slate-500 text-xs mt-1">Est. Time</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
              <p className={`font-black ${data.complexity === 'simple' ? 'text-emerald-400' : data.complexity === 'moderate' ? 'text-yellow-400' : 'text-red-400'}`}>{data.complexity}</p>
              <p className="text-slate-500 text-xs mt-1">Complexity</p>
            </div>
          </div>
          {data.blockers?.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
              <p className="text-red-400 font-bold text-sm mb-2">⚠️ Rollback Blockers</p>
              {data.blockers.map((b, i) => <p key={i} className="text-slate-300 text-sm">{b}</p>)}
            </div>
          )}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-slate-500 text-xs uppercase tracking-widest mb-3">Rollback Runbook</p>
            <ol className="space-y-2">
              {data.runbookSteps?.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="text-indigo-400 font-black shrink-0 w-5">{i + 1}.</span>
                  <span className="text-slate-300">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )
    }

    // Step 6 — Risk Heatmap
    if (stepNum === 6) {
      const data = stepData[6] as RiskScore | undefined
      if (!data || Array.isArray(data)) return <RawFallback step={stepNum} />
      return (
        <div className="space-y-5 fade-slide-in">
          {/* Overall score bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-slate-400 text-sm">Overall Risk Score</p>
              <span className={`text-xs font-bold px-2 py-1 rounded border ${RISK_COLOR[data.overallLabel]}`}>{data.overallLabel}</span>
            </div>
            <div className="relative h-4 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full confidence-bar ${data.overallScore >= 75 ? 'bg-red-500' : data.overallScore >= 50 ? 'bg-orange-500' : data.overallScore >= 25 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                style={{ width: `${data.overallScore}%` }}
              />
            </div>
            <p className="text-right text-slate-400 text-xs mt-1">{data.overallScore}/100</p>
          </div>

          {/* Dimension heatmap */}
          <div className="grid grid-cols-5 gap-2">
            {SCORE_DIMS.map(({ key, label }) => {
              const val = data[key]
              const bg  = val >= 75 ? 'bg-red-500' : val >= 50 ? 'bg-orange-500' : val >= 25 ? 'bg-yellow-500' : 'bg-emerald-500'
              const txt = val >= 75 ? 'text-red-400' : val >= 50 ? 'text-orange-400' : val >= 25 ? 'text-yellow-400' : 'text-emerald-400'
              return (
                <div key={key} className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
                  <div className="relative h-20 flex items-end justify-center mb-2">
                    <div className={`w-8 rounded-t-lg ${bg} opacity-80`} style={{ height: `${val}%` }} />
                  </div>
                  <p className={`text-sm font-black ${txt}`}>{val}</p>
                  <p className="text-slate-600 text-xs">{label}</p>
                </div>
              )
            })}
          </div>
        </div>
      )
    }

    // Step 7 — Verdict
    if (stepNum === 7) {
      const data = stepData[7] as Verdict | undefined
      if (!data || Array.isArray(data)) return <RawFallback step={stepNum} />
      const cfg = VERDICT_CONFIG[data.verdict]
      return (
        <div className="space-y-5 fade-slide-in">

          {/* Big verdict */}
          <div className={`rounded-2xl border ${cfg.border} ${cfg.bg} p-8 text-center`}>
            <p className="text-6xl mb-3">{cfg.icon}</p>
            <p className={`text-4xl font-black ${cfg.text} mb-2`}>{cfg.label}</p>
            <p className="text-slate-300 text-lg">{data.summary}</p>

            {/* Confidence meter */}
            <div className="mt-6 max-w-xs mx-auto">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Confidence</span>
                <span>{data.confidence}%</span>
              </div>
              <div className="relative h-3 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full confidence-bar ${cfg.color}`}
                  style={{ width: `${data.confidence}%` }}
                />
              </div>
            </div>
          </div>

          {/* Conditions (GO-WITH-CONDITIONS) */}
          {data.conditions?.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5">
              <p className="text-amber-400 font-black text-sm mb-3">⚡ Conditions — must be met before shipping</p>
              <ol className="space-y-2">
                {data.conditions.map((c, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="text-amber-500 font-black shrink-0">{i + 1}.</span>
                    <span className="text-slate-300 text-sm">{c}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Blockers (NO-GO) */}
          {data.blockers?.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5">
              <p className="text-red-400 font-black text-sm mb-3">🛑 Blockers — resolve before this can ship</p>
              <ol className="space-y-2">
                {data.blockers.map((b, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="text-red-500 font-black shrink-0">{i + 1}.</span>
                    <span className="text-slate-300 text-sm">{b}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Rollback runbook */}
          {data.rollbackRunbook?.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <p className="text-slate-500 text-xs uppercase tracking-widest mb-3">Rollback Runbook</p>
              <ol className="space-y-2">
                {data.rollbackRunbook.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="text-indigo-400 font-black shrink-0 w-5">{i + 1}.</span>
                    <span className="text-slate-300">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Slack message */}
          {data.slackMessage && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-slate-500 text-xs uppercase tracking-widest">Slack message</p>
                <button onClick={copySlack}
                  className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-lg transition-colors">
                  {slackCopied ? '✓ Copied!' : '📋 Copy'}
                </button>
              </div>
              <p className="text-slate-300 text-sm font-mono bg-slate-800 rounded-lg px-4 py-3 leading-relaxed">{data.slackMessage}</p>
            </div>
          )}
        </div>
      )
    }

    return null
  }

  function RawFallback({ step }: { step: number }) {
    return (
      <div className="bg-slate-800 rounded-xl p-4 max-h-64 overflow-y-auto">
        <p className="text-slate-500 text-xs mb-2">Raw output</p>
        <pre className="text-slate-300 text-xs font-mono whitespace-pre-wrap">{liveTextAccum.current[step] ?? ''}</pre>
      </div>
    )
  }

  const ENV_LABEL: Record<Environment, string> = { staging: '🧪 Staging', production: '🚀 Production', hotfix: '⚡ Hotfix' }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-black text-sm">RG</div>
          <span className="font-black">ReleaseGuard</span>
          <span className="text-slate-500 text-sm">/ ShipMind / Gate</span>
          <span className="text-xs bg-slate-800 border border-slate-700 text-slate-400 px-2 py-1 rounded">{ENV_LABEL[env]}</span>
        </div>
        <button onClick={() => router.push('/')} className="text-slate-500 hover:text-slate-300 text-xs">← New Release</button>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">

        {/* Verdict hero — appears once step 7 completes */}
        {vc && verdict && (
          <div className={`rounded-2xl border ${vc.border} ${vc.bg} p-6 mb-6 fade-slide-in`}>
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-5xl">{vc.icon}</span>
              <div className="flex-1">
                <p className={`text-3xl font-black ${vc.text}`}>{vc.label}</p>
                <p className="text-slate-400 text-sm mt-1">{verdict.summary}</p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-4xl font-black ${vc.text}`}>{verdict.confidence}%</p>
                <p className="text-slate-500 text-xs">confidence</p>
              </div>
            </div>
            {/* Confidence bar */}
            <div className="mt-4 h-2 bg-slate-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full confidence-bar ${vc.color}`} style={{ width: `${verdict.confidence}%` }} />
            </div>
          </div>
        )}

        {/* Risk heatmap summary — appears once step 6 completes */}
        {score && (
          <div className="grid grid-cols-5 gap-2 mb-6 fade-slide-in">
            {SCORE_DIMS.map(({ key, label }) => {
              const val = score[key]
              const txt = val >= 75 ? 'text-red-400' : val >= 50 ? 'text-orange-400' : val >= 25 ? 'text-yellow-400' : 'text-emerald-400'
              const bar = val >= 75 ? 'bg-red-500' : val >= 50 ? 'bg-orange-500' : val >= 25 ? 'bg-yellow-500' : 'bg-emerald-500'
              return (
                <div key={key} className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
                  <p className={`text-xl font-black ${txt}`}>{val}</p>
                  <div className="h-1.5 bg-slate-800 rounded-full mt-1.5 mb-1 overflow-hidden">
                    <div className={`h-full rounded-full ${bar}`} style={{ width: `${val}%` }} />
                  </div>
                  <p className="text-slate-600 text-xs">{label}</p>
                </div>
              )
            })}
          </div>
        )}

        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 text-red-400">{error}</div>}

        <div className="grid md:grid-cols-[260px_1fr] gap-5">

          {/* Left: step tracker */}
          <div className="space-y-2">
            {GATE_STEPS.map(step => {
              const isComplete = completedSteps.includes(step.id)
              const isActive   = activeStep === step.id
              const isSelected = displayTab === step.id

              return (
                <button key={step.id} onClick={() => setPinnedTab(step.id)}
                  className={`w-full text-left rounded-xl border p-4 transition-all ${
                    isSelected ? 'border-indigo-500/60 bg-indigo-500/10 shadow-lg shadow-indigo-500/10' :
                    isComplete ? 'border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50 cursor-pointer' :
                    isActive   ? 'border-indigo-500/40 bg-indigo-500/5 pulse-ring cursor-default' :
                                 'border-slate-800 bg-slate-900/50 opacity-40 cursor-default'
                  }`}>
                  <div className="flex items-center gap-3 mb-1">
                    <span className={`text-xl ${isActive && !isComplete ? 'spin-slow inline-block' : ''}`}>{step.icon}</span>
                    <span className="text-sm font-bold text-white">{step.label}</span>
                    <span className="ml-auto text-xs">
                      {isComplete ? <span className="text-emerald-400">✓</span> :
                       isActive   ? <span className="text-indigo-400 blink">● Live</span> :
                                    <span className="text-slate-700">–</span>}
                    </span>
                  </div>
                  <p className="text-slate-600 text-xs leading-tight">{step.description}</p>
                </button>
              )
            })}

            {done && (
              <div className="mt-4 space-y-2">
                <button onClick={copySlack}
                  className="w-full text-sm bg-slate-800 border border-slate-700 text-slate-300 hover:text-white py-2.5 rounded-xl transition-colors">
                  {slackCopied ? '✓ Copied!' : '💬 Copy Slack Message'}
                </button>
                <button onClick={() => router.push('/')}
                  className="w-full text-sm bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 hover:text-indigo-300 py-2.5 rounded-xl transition-colors">
                  ← Run Another Gate
                </button>
              </div>
            )}
          </div>

          {/* Right: content panel */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 min-h-80">
            {displayTab === 0 ? (
              <div className="text-center py-16">
                <div className="inline-block w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full spin-slow mb-4" />
                <p className="text-slate-400">Initialising gate…</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-5 pb-4 border-b border-slate-800">
                  <span className="text-xl">{GATE_STEPS[displayTab - 1]?.icon}</span>
                  <div>
                    <h2 className="font-bold text-white">Step {displayTab} — {GATE_STEPS[displayTab - 1]?.label}</h2>
                    <p className="text-slate-500 text-xs">{GATE_STEPS[displayTab - 1]?.description}</p>
                  </div>
                  {completedSteps.includes(displayTab) && displayTab !== 7 && <span className="ml-auto text-emerald-400 text-sm font-bold">✓ Complete</span>}
                  {activeStep === displayTab && !completedSteps.includes(displayTab) && <span className="ml-auto text-indigo-400 text-sm font-bold blink">● Running</span>}
                  {displayTab === 7 && vc && <span className={`ml-auto text-sm font-black ${vc.text}`}>{vc.icon} {vc.label}</span>}
                </div>
                <StepContent stepNum={displayTab} />
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
