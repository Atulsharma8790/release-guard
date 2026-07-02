import { Suspense } from 'react'
import type { Metadata } from 'next'
import './globals.css'
import PortfolioBar from '@/app/components/PortfolioBar'


export const metadata: Metadata = {
  title: 'ReleaseGuard (ShipMind) — Agentic Release Gate',
  description: 'AI-powered GO/NO-GO release decisions with 7-step risk analysis',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#0a0a0f] text-slate-200">
        <Suspense fallback={null}><PortfolioBar /></Suspense>{children}</body>
    </html>
  )
}
