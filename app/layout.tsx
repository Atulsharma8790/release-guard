import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ReleaseGuard (ShipMind) — Agentic Release Gate',
  description: 'AI-powered GO/NO-GO release decisions with 7-step risk analysis',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#0a0a0f] text-slate-200">{children}</body>
    </html>
  )
}
