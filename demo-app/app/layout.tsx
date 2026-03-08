import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ShieldPay — CRE-Verified Agent Payments',
  description: 'Trust layer for autonomous agent x402 micropayments. Powered by Chainlink CRE.',
  openGraph: {
    title: 'ShieldPay — CRE-Verified Agent Payments',
    description: 'The missing trust layer for the x402 agent economy. Verify delivery, enforce spending policies, resolve disputes — all on-chain via Chainlink CRE.',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="noise-bg grid-bg min-h-screen">
        {children}
      </body>
    </html>
  )
}
