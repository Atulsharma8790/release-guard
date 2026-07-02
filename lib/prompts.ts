export type Environment = 'staging' | 'production' | 'hotfix'

export const GATE_STEPS = [
  { id: 1, icon: '🔍', label: 'Change Analyzer',      description: 'Mapping all changed files, APIs and surfaces to understand the blast radius.' },
  { id: 2, icon: '🧨', label: 'Regression Detector',  description: 'Identifying which existing behaviours are most likely to break.' },
  { id: 3, icon: '🧪', label: 'Coverage Auditor',      description: 'Checking whether risky areas have sufficient automated test coverage.' },
  { id: 4, icon: '📦', label: 'Dependency Scanner',    description: 'Scanning upstream/downstream dependencies for blast-radius and version conflicts.' },
  { id: 5, icon: '🔄', label: 'Rollback Assessor',     description: 'Evaluating how safely and quickly this release can be rolled back if needed.' },
  { id: 6, icon: '📊', label: 'Risk Scorer',           description: 'Producing a weighted risk score across all six dimensions.' },
  { id: 7, icon: '🚦', label: 'GO / NO-GO Verdict',    description: 'Final release decision with confidence %, conditions, and rollback runbook.' },
]

const ENV_THRESHOLDS: Record<Environment, string> = {
  staging:    'Thresholds are relaxed — staging exists to catch issues, so accept moderate risk.',
  production: 'Thresholds are strict — any high-severity regression or coverage gap below 60% should trigger NO-GO or conditions.',
  hotfix:     'Thresholds favour speed — scope is narrow so focus on regression risk for the specific fix only; coverage requirements are reduced.',
}

export function buildSystemPrompt(env: Environment): string {
  return `You are ShipMind, an expert release-gate AI. You analyse software releases and give a structured GO / NO-GO / GO-WITH-CONDITIONS verdict.

Environment: ${env.toUpperCase()}
${ENV_THRESHOLDS[env]}

You will output 7 sequential analysis steps. Each step is wrapped in STEP_N_START ... STEP_N_END markers and contains ONLY valid JSON — no markdown fences, no prose outside the JSON.

STEP 1 — Change Analyzer → JSON array:
[{ "area": string, "changeType": "added"|"modified"|"deleted", "riskSurface": string, "files": string[] }]

STEP 2 — Regression Detector → JSON array:
[{ "feature": string, "regressionRisk": "high"|"medium"|"low", "reason": string, "affectedUsers": string }]

STEP 3 — Coverage Auditor → JSON array:
[{ "area": string, "coverageEstimate": string, "gaps": string[], "verdict": "adequate"|"partial"|"missing" }]

STEP 4 — Dependency Scanner → JSON array:
[{ "dependency": string, "direction": "upstream"|"downstream", "risk": "high"|"medium"|"low", "detail": string }]

STEP 5 — Rollback Assessor → JSON object:
{ "rollbackFeasible": boolean, "estimatedTime": string, "complexity": "simple"|"moderate"|"complex", "blockers": string[], "runbookSteps": string[] }

STEP 6 — Risk Scorer → JSON object:
{ "changeRisk": number, "regressionRisk": number, "coverageRisk": number, "dependencyRisk": number, "rollbackRisk": number, "overallScore": number, "overallLabel": "low"|"medium"|"high"|"critical" }
(scores are 0–100, where 100 = maximum risk)

STEP 7 — GO / NO-GO Verdict → JSON object:
{ "verdict": "GO"|"NO-GO"|"GO-WITH-CONDITIONS", "confidence": number, "summary": string, "conditions": string[], "blockers": string[], "slackMessage": string, "rollbackRunbook": string[] }
(confidence 0–100; conditions only for GO-WITH-CONDITIONS; blockers only for NO-GO; slackMessage is a ready-to-paste Slack message ≤280 chars; rollbackRunbook is always populated)

Output all 7 steps in sequence, one after another.`
}

export function buildUserPrompt(releaseInfo: string, env: Environment): string {
  return `Analyse this release for ${env.toUpperCase()} deployment and run all 7 gate steps:

${releaseInfo}

STEP_1_START
`
}
