'use client'
import { useState, useEffect, useRef } from 'react'
type StepStatus = 'pending' | 'running' | 'success' | 'error'
interface PipeStep { id: string; label: string; icon: string; capability: string; status: StepStatus; detail: string; txHash?: string; duration?: number }
interface LogEntry { timestamp: string; level: 'info' | 'warn' | 'success' | 'error' | 'payment'; message: string }
const INIT_STEPS: PipeStep[] = [
  { id: 'discover', label: 'DISCOVER', icon: '🔍', capability: 'MCP Registry', status: 'pending', detail: '' },
  { id: 'preflight', label: 'PRE-FLIGHT', icon: '🛡️', capability: 'EVM Read + Confidential HTTP', status: 'pending', detail: '' },
  { id: 'payment', label: 'x402 PAYMENT', icon: '💰', capability: 'x402 + Coinbase Facilitator', status: 'pending', detail: '' },
  { id: 'execute', label: 'MCP EXECUTE', icon: '⚡', capability: 'HTTP Capability', status: 'pending', detail: '' },
  { id: 'validate', label: 'CRE VALIDATE', icon: '✅', capability: 'Off-chain Compute (DON)', status: 'pending', detail: '' },
  { id: 'attest', label: 'ON-CHAIN ATTEST', icon: '⛓️', capability: 'EVM Write (Report)', status: 'pending', detail: '' },
]
const VULNS = [
  { sev: 'CRITICAL', title: 'Reentrancy in withdraw()', line: 142 },
  { sev: 'HIGH', title: 'Unchecked delegatecall', line: 89 },
  { sev: 'MEDIUM', title: 'Block.timestamp dependency', line: 201 },
]
const SDK_CODE = `import { ShieldPayClient } from 'shieldpay-sdk'

const shield = new ShieldPayClient({
  agentWallet: privateKey,
  network: 'base-sepolia',
  vault: '0x95e10BaC...',
})

// One call = pay + verify + attest
const result = await shield.verifiedCall({
  mcp: 'https://security.shieldpay.xyz/mcp',
  tool: 'scan-contract',
  args: { address: '0xdead...' },
})

console.log(result.attestationTx) // 0x6346...
console.log(result.qualityScore)  // 85/100`

function ts() { return new Date().toISOString().split('T')[1].split('.')[0] }
function sh(h: string) { return h.slice(0, 10) + '...' + h.slice(-8) }

function Dot({ s }: { s: StepStatus }) {
  const c: Record<StepStatus, string> = { pending: 'bg-zinc-600', running: 'bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.6)]', success: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]', error: 'bg-red-500' }
  return <div className={`w-2.5 h-2.5 rounded-full ${c[s]} transition-all duration-300`} />
}

function Step({ step, i, n }: { step: PipeStep; i: number; n: number }) {
  const act = step.status === 'running', done = step.status === 'success'
  return (
    <div className={`relative flex items-start gap-4 py-3.5 px-4 rounded-lg border transition-all duration-500 ${act ? 'border-amber-500/40 bg-amber-500/5 shadow-[0_0_30px_rgba(251,191,36,0.08)]' : done ? 'border-emerald-500/30 bg-emerald-500/[0.02]' : 'border-zinc-800/60 bg-zinc-900/20'}`}>
      {i < n - 1 && <div className={`absolute left-[29px] top-full w-px h-3 transition-colors duration-500 ${done ? 'bg-emerald-500/40' : 'bg-zinc-800'}`} />}
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 transition-all duration-500 border ${act ? 'bg-amber-500/10 border-amber-500/30 scale-110' : done ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-zinc-900 border-zinc-800'}`}>
        {done ? <span className="text-emerald-400 text-xs font-bold">✓</span> : act ? <span className="animate-pulse">{step.icon}</span> : step.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <Dot s={step.status} />
          <span className="font-mono text-[11px] font-bold tracking-widest text-zinc-300 uppercase">{step.label}</span>
          {step.duration && <span className="font-mono text-[10px] text-zinc-500">{step.duration}ms</span>}
        </div>
        <div className="font-mono text-[10px] text-zinc-500 mb-1">{step.capability}</div>
        {step.detail && <div className={`font-mono text-[11px] leading-relaxed ${done ? 'text-emerald-400/80' : act ? 'text-amber-400/80' : 'text-zinc-500'}`}>{step.detail}</div>}
        {step.txHash && <a href={`https://sepolia.basescan.org/tx/${step.txHash}`} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] text-blue-400 hover:underline mt-1 inline-block">TX: {sh(step.txHash)} ↗</a>}
      </div>
    </div>
  )
}

function Log({ e }: { e: LogEntry }) {
  const c: Record<string, string> = { info: 'text-zinc-400', warn: 'text-amber-400', success: 'text-emerald-400', error: 'text-red-400', payment: 'text-violet-400' }
  const p: Record<string, string> = { info: 'INF', warn: 'WRN', success: 'OK ', error: 'ERR', payment: 'PAY' }
  return <div className="font-mono text-[11px] leading-5 flex gap-2"><span className="text-zinc-600 shrink-0">{e.timestamp}</span><span className={`shrink-0 font-bold ${c[e.level]}`}>[{p[e.level]}]</span><span className={c[e.level]}>{e.message}</span></div>
}

function Sev({ s }: { s: string }) {
  const c: Record<string, string> = { CRITICAL: 'bg-red-500/20 text-red-400 border-red-500/30', HIGH: 'bg-orange-500/20 text-orange-400 border-orange-500/30', MEDIUM: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' }
  return <span className={`inline-flex px-1.5 py-0.5 text-[9px] font-mono font-bold rounded border ${c[s] || 'text-zinc-400'}`}>{s}</span>
}

export default function Home() {
  const [steps, setSteps] = useState<PipeStep[]>(INIT_STEPS)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [showRes, setShowRes] = useState(false)
  const [copied, setCopied] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  useEffect(() => { logRef.current && (logRef.current.scrollTop = logRef.current.scrollHeight) }, [logs])
  const log = (level: LogEntry['level'], message: string) => setLogs(p => [...p, { timestamp: ts(), level, message }])
  const upd = (id: string, u: Partial<PipeStep>) => setSteps(p => p.map(s => s.id === id ? { ...s, ...u } : s))
  const d = (ms: number) => new Promise(r => setTimeout(r, ms))

  const run = async () => {
    setRunning(true); setDone(false); setShowRes(false); setSteps(INIT_STEPS); setLogs([])
    log('info', 'OpenClaw agent received /scan 0xdead...0001 from Telegram')
    await d(400)
    upd('discover', { status: 'running', detail: 'Querying MCP registry for security tools...' })
    log('info', 'Searching MCP registry: category=security, chain=base')
    await d(800)
    log('success', 'Found: ShieldPay Security MCP — scan-contract ($0.05 USDC)')
    upd('discover', { status: 'success', detail: 'Selected: scan-contract @ security.shieldpay.xyz', duration: 820 })
    await d(300)
    upd('preflight', { status: 'running', detail: 'Reading spending policy from ShieldVault.sol...' })
    log('info', 'CRE Pre-flight: reading checkPolicy(agent, 50000) on Base Sepolia')
    await d(600)
    log('info', 'Confidential HTTP: checking agent wallet USDC balance')
    await d(500)
    log('success', 'Policy PASSED — maxPerCall: 0.10, dailySpent: 0.12/5.00 USDC')
    upd('preflight', { status: 'success', detail: 'Policy: ✓ within limits (0.12/5.00 daily)', duration: 1180 })
    await d(300)
    upd('payment', { status: 'running', detail: 'Initiating x402 payment...' })
    log('payment', 'x402 → POST /mcp → HTTP 402 Payment Required')
    await d(400)
    log('payment', 'Payment: 0.05 USDC on Base Sepolia → 0x7B3f...MCPwallet')
    await d(300)
    log('payment', 'Signing EIP-712 payment payload with agent wallet...')
    await d(500)
    log('payment', 'Coinbase Facilitator: verifying payment...')
    await d(600)
    const ptx = '0xa1b2c3d4e5f6789012345678abcdef0123456789abcdef0123456789abcdef01'
    log('success', `Payment settled! TX: ${sh(ptx)}`)
    upd('payment', { status: 'success', detail: '0.05 USDC paid → receipt captured', duration: 1890, txHash: ptx })
    await d(300)
    upd('execute', { status: 'running', detail: 'Calling scan-contract with payment receipt...' })
    log('info', 'CRE HTTP → POST security.shieldpay.xyz/mcp')
    await d(800)
    log('info', 'MCP analyzing: bytecode patterns...'); await d(500)
    log('info', 'MCP analyzing: slither rules...'); await d(400)
    log('info', 'MCP analyzing: semgrep solidity...'); await d(500)
    log('warn', 'CRITICAL: Reentrancy in withdraw() — Line 142')
    log('warn', 'HIGH: Unchecked delegatecall — Line 89')
    log('warn', 'MEDIUM: Block.timestamp dependency — Line 201')
    log('success', 'MCP returned: 3 vulns, risk score 73/100')
    upd('execute', { status: 'success', detail: '3 vulns: CRITICAL:1, HIGH:1, MEDIUM:1 — score: 73', duration: 2240 })
    await d(300)
    upd('validate', { status: 'running', detail: 'DON consensus: validating response quality...' })
    log('info', 'CRE Compute: schema ✓ content 847B ✓ HTTP 200 ✓'); await d(700)
    log('success', 'DON consensus: quality 85/100')
    upd('validate', { status: 'success', detail: 'Quality: 85/100 — schema ✓ content ✓ latency ✓', duration: 1240 })
    await d(300)
    upd('attest', { status: 'running', detail: 'Generating DON-signed report...' })
    log('info', 'CRE: encoding attestation (paymentHash, serviceHash, score)')
    await d(500)
    log('info', 'CRE: runtime.report() → signed report'); await d(600)
    log('info', 'CRE: writeReport() → ShieldVault.sol on Base Sepolia'); await d(800)
    log('info', 'Waiting for block confirmation...'); await d(1200)
    const atx = '0x6346d9eeca2f2875131d38aa9903a216f16e3cc7188f0ac9e2d1b3c4a5f6e7d8'
    log('success', `Attestation written! TX: ${sh(atx)}`)
    log('success', 'Gas: 142,891 — Block: 24,891,337')
    upd('attest', { status: 'success', detail: 'Attestation: quality=85, risk=73, disputed=false', duration: 3150, txHash: atx })
    await d(500)
    log('success', '══════ SHIELDPAY VERIFICATION COMPLETE ══════')
    log('success', 'Agent paid 0.05 USDC | Service verified | Proof on-chain')
    setRunning(false); setDone(true); setShowRes(true)
  }

  return (
    <main className="min-h-screen bg-[#08080c] text-zinc-200 selection:bg-emerald-500/30">
      <div className="fixed inset-0 pointer-events-none z-0" style={{ backgroundImage: 'linear-gradient(rgba(0,255,136,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,136,0.015) 1px, transparent 1px)', backgroundSize: '80px 80px' }} />
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">
        {/* NAV */}
        <nav className="flex items-center justify-between py-6 border-b border-zinc-800/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center"><span className="text-emerald-400 text-sm">⛡</span></div>
            <div><div className="font-mono text-sm font-bold text-white">ShieldPay</div><div className="font-mono text-[9px] text-zinc-600 tracking-widest uppercase">CRE-Verified Agent Payments</div></div>
          </div>
          <div className="flex items-center gap-5 font-mono text-[11px]">
            <a href="https://github.com/Jawy77/MCPay" target="_blank" className="text-zinc-500 hover:text-emerald-400 transition-colors">GitHub ↗</a>
            <span className="px-2 py-1 rounded border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-[10px]">Chainlink CRE</span>
          </div>
        </nav>
        {/* HERO */}
        <section className="pt-16 pb-12">
          <div className="flex items-center gap-2 mb-6">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">CONVERGENCE 2026</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-violet-500/10 text-violet-400 border border-violet-500/20">x402</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20">BASE SEPOLIA</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] mb-6">
            <span className="text-white">Agents pay.</span><br />
            <span className="text-white">Nobody </span><span className="text-zinc-600 line-through decoration-red-500/50">verifies.</span><br />
            <span className="relative inline-block text-emerald-400"><span className="relative z-10">Until now.</span><span className="absolute top-0 left-0.5 text-red-500/20 z-0 select-none" aria-hidden>Until now.</span><span className="absolute top-0 -left-0.5 text-cyan-500/20 z-0 select-none" aria-hidden>Until now.</span></span>
          </h1>
          <p className="text-base sm:text-lg text-zinc-400 max-w-xl leading-relaxed mb-8"><span className="text-zinc-200 font-medium">ShieldPay</span> is the CRE-powered trust layer for x402 agent payments. Verify delivery. Enforce spending policies. Attest on-chain.</p>
          <div className="flex flex-wrap gap-3">
            <button onClick={run} disabled={running} className={`px-5 py-2.5 rounded-lg font-mono text-sm font-medium transition-all duration-300 ${running ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400 cursor-wait' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 hover:shadow-[0_0_30px_rgba(0,255,136,0.1)]'}`}>
              {running ? '⏳ Running pipe...' : done ? '↻ Run demo again' : '▶ Run live demo'}
            </button>
            <a href="#sdk" className="px-5 py-2.5 rounded-lg font-mono text-sm border border-zinc-700 text-zinc-400 hover:border-zinc-500 transition-all">Get SDK →</a>
          </div>
        </section>
        {/* LIVE DEMO */}
        <section className="pb-16">
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800/60 bg-zinc-900/50">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" /><div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" /><div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                <span className="font-mono text-[10px] text-zinc-600 ml-2 tracking-wider">SHIELDPAY PIPELINE</span>
              </div>
              <div className="p-4 space-y-2">
                {steps.map((s, i) => <Step key={s.id} step={s} i={i} n={steps.length} />)}
                {showRes && (
                  <div className="mt-4 p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.03]">
                    <div className="font-mono text-[10px] text-emerald-400 font-bold tracking-widest mb-3">SCAN RESULT</div>
                    <div className="space-y-2">{VULNS.map((v, i) => <div key={i} className="flex items-center gap-2 font-mono text-[11px]"><Sev s={v.sev} /><span className="text-zinc-300">{v.title}</span><span className="text-zinc-600 ml-auto">L{v.line}</span></div>)}</div>
                    <div className="mt-3 pt-3 border-t border-zinc-800 font-mono text-[11px] text-zinc-400">Risk: <span className="text-red-400 font-bold">73/100</span> · Quality: <span className="text-emerald-400 font-bold">85/100</span> · Paid: <span className="text-violet-400">0.05 USDC</span></div>
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 overflow-hidden flex flex-col">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800/60 bg-zinc-900/50">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-mono text-[10px] text-zinc-600 tracking-wider">LIVE EXECUTION LOG</span>
                <span className="font-mono text-[10px] text-zinc-700 ml-auto">{logs.length} events</span>
              </div>
              <div ref={logRef} className="flex-1 p-4 overflow-y-auto max-h-[600px] min-h-[400px] bg-[#06060a]">
                {logs.length === 0 ? <div className="flex items-center justify-center h-full"><span className="font-mono text-[11px] text-zinc-700">Click &quot;Run live demo&quot; to start ▶</span></div> : <div className="space-y-0.5">{logs.map((e, i) => <Log key={i} e={e} />)}{running && <span className="font-mono text-[11px] text-emerald-400 animate-pulse">█</span>}</div>}
              </div>
            </div>
          </div>
        </section>
        {/* WHY */}
        <section className="py-16 border-t border-zinc-800/50">
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { icon: '🔒', t: 'Verified Delivery', d: 'CRE DON consensus confirms MCP delivered what agent paid for. Not just payment — proof of service.', tag: 'CRE & AI' },
              { icon: '📊', t: 'Spending Policies', d: 'On-chain limits: max per call, daily caps, allowed servers. CRE pre-flight enforces before payment.', tag: 'Risk & Compliance' },
              { icon: '🔐', t: 'Confidential Checks', d: 'Wallet balances verified via CRE Confidential HTTP. Agent keys never exposed on-chain or to MCP.', tag: 'Privacy' },
            ].map(x => (
              <div key={x.t} className="p-5 rounded-xl border border-zinc-800/60 bg-zinc-900/20 hover:border-zinc-700 transition-all group">
                <div className="flex items-center justify-between mb-3"><span className="text-xl">{x.icon}</span><span className="font-mono text-[9px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-500 group-hover:text-emerald-400 transition-colors">{x.tag}</span></div>
                <h3 className="font-mono text-sm font-bold text-white mb-2">{x.t}</h3>
                <p className="text-[13px] text-zinc-500 leading-relaxed">{x.d}</p>
              </div>
            ))}
          </div>
        </section>
        {/* SDK */}
        <section id="sdk" className="py-16 border-t border-zinc-800/50">
          <div className="mb-8">
            <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">SDK</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mt-3 mb-2">Verified payments in 3 lines</h2>
          </div>
          <button onClick={() => { navigator.clipboard.writeText('npm install shieldpay-sdk @x402/axios viem'); setCopied(true); setTimeout(() => setCopied(false), 2000) }} className="flex items-center gap-2 px-4 py-2.5 mb-4 rounded-lg border border-zinc-800 bg-zinc-900/50 font-mono text-sm hover:border-emerald-500/30 transition-all group w-full sm:w-auto">
            <span className="text-zinc-600">$</span><span className="text-emerald-400">npm install shieldpay-sdk @x402/axios viem</span><span className="text-zinc-600 group-hover:text-emerald-400 ml-auto sm:ml-4 transition-colors">{copied ? '✓' : '⎘'}</span>
          </button>
          <div className="rounded-xl border border-zinc-800/60 bg-[#0a0a0f] overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
            <div className="px-4 py-2.5 border-b border-zinc-800/40"><span className="font-mono text-[10px] text-zinc-600">agent.ts</span></div>
            <pre className="p-4 overflow-x-auto font-mono text-[12px] leading-6">{SDK_CODE.split('\n').map((l, i) => <div key={i} className="flex"><span className="w-7 text-right pr-3 text-zinc-700 select-none shrink-0 text-[11px]">{i + 1}</span><span className={l.startsWith('//') ? 'text-zinc-600' : l.startsWith('import') ? 'text-violet-400' : l.includes('await') ? 'text-amber-400' : l.includes('console') ? 'text-blue-400' : 'text-zinc-300'}>{l || ' '}</span></div>)}</pre>
          </div>
        </section>
        {/* FOOTER */}
        <footer className="py-8 border-t border-zinc-800/50">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="font-mono text-[11px] text-zinc-600">Built by <span className="text-zinc-400">Jawy</span> · <a href="https://mantishield.com" className="text-emerald-500/70 hover:text-emerald-400">Mantishield</a> · Bogotá 🇨🇴</div>
            <div className="flex items-center gap-5 font-mono text-[11px] text-zinc-600">
              <a href="https://github.com/Jawy77/MCPay" className="hover:text-emerald-400 transition-colors">GitHub</a>
              <a href="https://twitter.com/Jawy77" className="hover:text-emerald-400 transition-colors">@Jawy77</a>
              <a href="https://chain.link/hackathon" className="hover:text-emerald-400 transition-colors">Hackathon</a>
            </div>
          </div>
        </footer>
      </div>
    </main>
  )
}
