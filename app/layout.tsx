import type { Metadata } from 'next'
import { JetBrains_Mono, Space_Grotesk, Playfair_Display } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const jetbrainsMono = JetBrains_Mono({ 
  subsets: ["latin"],
  variable: '--font-mono'
});

const spaceGrotesk = Space_Grotesk({ 
  subsets: ["latin"],
  variable: '--font-sans'
});

const playfairDisplay = Playfair_Display({ 
  subsets: ["latin"],
  variable: '--font-serif'
});

export const metadata: Metadata = {
  title: 'MCPay | Universal x402 Payment Gateway for Premium MCP Tools',
  description: 'MCPay enables AI agents to buy premium MCP tools with USDC micropayments on Base Sepolia, verified by Chainlink CRE. Your agent pays. Chainlink verifies. On-chain proof.',
  generator: 'v0.app',
  keywords: ['x402', 'MCP', 'AI agents', 'USDC', 'Base Sepolia', 'Chainlink', 'CRE', 'micropayments', 'Web3'],
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} ${playfairDisplay.variable} font-sans antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
