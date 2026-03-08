'use client'

import { useState, useEffect, useRef } from 'react'
import { Copy, Check, Wallet, Shield, BarChart3, Bot, Zap, ExternalLink, X, ChevronRight, Terminal } from 'lucide-react'
import Image from 'next/image'

// Types
interface Tool {
  id: string
  emoji: string
  name: string
  provider: string
  category: 'security' | 'data' | 'ai' | 'infra'
  price: number
  description: string
  attestations: number
}

interface LogEntry {
  prefix: 'INF' | 'PAY' | 'OK' | 'WRN'
  message: string
  timestamp: string
}

interface FlowNode {
  id: string
  icon: string
  label: string
  status: 'pending' | 'running' | 'done'
  detail: string
  duration?: string
}

// Tool data
const tools: Tool[] = [
  { id: 'scan-contract', emoji: '🔍', name: 'scan-contract', provider: 'Mantishield', category: 'security', price: 0.05, description: 'Smart contract vulnerability scanner', attestations: 287 },
  { id: 'check-address', emoji: '🛡️', name: 'check-address', provider: 'MCPay', category: 'security', price: 0.02, description: 'Address reputation & threat intelligence', attestations: 142 },
  { id: 'defi-analytics', emoji: '📊', name: 'defi-analytics', provider: 'ChainPulse', category: 'data', price: 0.03, description: 'Real-time DeFi protocol metrics', attestations: 89 },
  { id: 'ai-sentiment', emoji: '🤖', name: 'ai-sentiment', provider: 'NeuralEdge', category: 'ai', price: 0.04, description: 'LLM market sentiment analysis', attestations: 63 },
  { id: 'deep-audit', emoji: '🔐', name: 'deep-audit', provider: 'OpenZeppelin', category: 'security', price: 0.50, description: 'Comprehensive AI-powered audit', attestations: 31 },
  { id: 'gas-oracle', emoji: '⚡', name: 'gas-oracle', provider: 'BlockSmith', category: 'infra', price: 0.01, description: 'Optimal gas price predictions', attestations: 412 },
]

const categoryColors: Record<string, string> = {
  security: '#00FF88',
  data: '#00D4FF',
  ai: '#8B5CF6',
  infra: '#FFB547',
}

const categoryIcons: Record<string, React.ReactNode> = {
  security: <Shield className="w-4 h-4" />,
  data: <BarChart3 className="w-4 h-4" />,
  ai: <Bot className="w-4 h-4" />,
  infra: <Zap className="w-4 h-4" />,
}

export default function MCPayPage() {
  // State
  const [isConnected, setIsConnected] = useState(false)
  const [showWalletModal, setShowWalletModal] = useState(false)
  const [isApproved, setIsApproved] = useState(false)
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [usdcBalance, setUsdcBalance] = useState(5.00)
  const [ethBalance] = useState(0.05)
  const [dailySpent, setDailySpent] = useState(0.15)
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [copied, setCopied] = useState(false)
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null)
  const [flowRunning, setFlowRunning] = useState(false)
  const [flowComplete, setFlowComplete] = useState(false)
  const [flowNodes, setFlowNodes] = useState<FlowNode[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [showReceipt, setShowReceipt] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState(false)
  
  // Animation state for enhanced flow visualization
  const [activatingNode, setActivatingNode] = useState<string | null>(null)
  const [successNode, setSuccessNode] = useState<string | null>(null)
  const [travelingBall, setTravelingBall] = useState<{ from: number; to: number; speed: string; color: string } | null>(null)
  const [completedConnections, setCompletedConnections] = useState<number[]>([])
  
  // Animated counters
  const [displayedServices, setDisplayedServices] = useState(0)
  const [displayedTxns, setDisplayedTxns] = useState(0)
  const [qualityScore, setQualityScore] = useState(0)
  
  const flowRef = useRef<HTMLDivElement>(null)
  const logsRef = useRef<HTMLDivElement>(null)
  
  // Policy state
  const [maxPerCall, setMaxPerCall] = useState('0.10')
  const [maxPerDay, setMaxPerDay] = useState('5.00')

  // Count-up animation on mount with odometer effect
  useEffect(() => {
    const duration = 2000
    const steps = 60
    const interval = duration / steps
    
    let currentStep = 0
    const timer = setInterval(() => {
      currentStep++
      const progress = currentStep / steps
      setDisplayedServices(Math.floor(251 * progress))
      setDisplayedTxns(Math.floor(50 * progress))
      
      if (currentStep >= steps) {
        clearInterval(timer)
        setDisplayedServices(251)
        setDisplayedTxns(50)
      }
    }, interval)
    
    return () => clearInterval(timer)
  }, [])

  // Copy address
  const handleCopyAddress = () => {
    navigator.clipboard.writeText('0x7B3f8a2C1D4e5F6b7A8c9D0e1F2a3B4c5D6e7F8a')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Copy code
  const handleCopyCode = () => {
    navigator.clipboard.writeText(`npm install mcpay-sdk`)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  // Connect wallet simulation
  const handleConnectWallet = () => {
    setShowWalletModal(true)
  }

  const handleSelectWallet = () => {
    setTimeout(() => {
      setShowWalletModal(false)
      setIsConnected(true)
    }, 1500)
  }

  // Approval flow
  const handleApprove = () => {
    setShowApprovalModal(true)
  }

  const confirmApproval = () => {
    setShowApprovalModal(false)
    setTimeout(() => {
      setIsApproved(true)
    }, 500)
  }

  // Filter tools
  const filteredTools = activeFilter === 'all' 
    ? tools 
    : tools.filter(t => t.category === activeFilter)

  // Buy flow
  const handleBuy = (tool: Tool) => {
    if (!isConnected) {
      setShowWalletModal(true)
      return
    }
    if (!isApproved) {
      setShowApprovalModal(true)
      return
    }
    
    setSelectedTool(tool)
    setFlowRunning(true)
    setFlowComplete(false)
    setShowReceipt(false)
    setLogs([])
    setQualityScore(0)
    setActivatingNode(null)
    setSuccessNode(null)
    setTravelingBall(null)
    setCompletedConnections([])
    
    // Initialize flow nodes
    const initialNodes: FlowNode[] = [
      { id: 'openclaw', icon: '🤖', label: 'OpenClaw', status: 'pending', detail: 'Waiting...' },
      { id: 'preflight', icon: '🛡️', label: 'Pre-flight', status: 'pending', detail: 'Waiting...' },
      { id: 'x402pay', icon: '💰', label: 'x402 Pay', status: 'pending', detail: 'Waiting...' },
      { id: 'mcprun', icon: '⚡', label: 'MCP Run', status: 'pending', detail: 'Waiting...' },
      { id: 'crecheck', icon: '✅', label: 'CRE Check', status: 'pending', detail: 'Waiting...' },
      { id: 'attest', icon: '⛓️', label: 'Attest', status: 'pending', detail: 'Waiting...' },
    ]
    setFlowNodes(initialNodes)
    
    // Scroll to flow section
    setTimeout(() => {
      flowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
    
    // Run the animation sequence
    runFlowAnimation(tool, initialNodes)
  }

  const addLog = (prefix: LogEntry['prefix'], message: string) => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false })
    setLogs(prev => [...prev, { prefix, message, timestamp }])
    setTimeout(() => {
      logsRef.current?.scrollTo({ top: logsRef.current.scrollHeight, behavior: 'smooth' })
    }, 50)
  }

  const updateNode = (nodeId: string, updates: Partial<FlowNode>) => {
    setFlowNodes(prev => {
      const newNodes = prev.map(n => n.id === nodeId ? { ...n, ...updates } : n)
      
      // Trigger activation bounce when node goes to 'running'
      if (updates.status === 'running') {
        setActivatingNode(nodeId)
        setTimeout(() => setActivatingNode(null), 400)
      }
      
      // Trigger success flash when node completes
      if (updates.status === 'done') {
        setSuccessNode(nodeId)
        setTimeout(() => setSuccessNode(null), 200)
        
        // Mark the connection before this node as complete
        const nodeIndex = prev.findIndex(n => n.id === nodeId)
        if (nodeIndex > 0) {
          setCompletedConnections(c => [...c, nodeIndex - 1])
        }
      }
      
      return newNodes
    })
  }
  
  // Trigger traveling ball animation between nodes
  const triggerTravelingBall = (fromIndex: number, toIndex: number, speed: string, color: string) => {
    setTravelingBall({ from: fromIndex, to: toIndex, speed, color })
    const duration = speed === 'fast' ? 400 : speed === 'slow' ? 800 : speed === 'dramatic' ? 1000 : 600
    setTimeout(() => setTravelingBall(null), duration)
  }

  const runFlowAnimation = async (tool: Tool, _nodes: FlowNode[]) => {
    // Node 1: OpenClaw
    updateNode('openclaw', { status: 'running', detail: 'Selecting MCPremium tool...' })
    addLog('INF', `Agent requesting tool: ${tool.name}`)
    await delay(800)
    updateNode('openclaw', { status: 'done', detail: `${tool.name} selected`, duration: '0.8s' })
    addLog('OK', `Tool selected: ${tool.name} by ${tool.provider}`)
    
    // Ball: OpenClaw → Pre-flight (green, normal speed)
    triggerTravelingBall(0, 1, 'normal', '#00FF88')
    await delay(600)
    
    // Node 2: Pre-flight
    updateNode('preflight', { status: 'running', detail: 'Reading policy from ShieldVault...' })
    addLog('INF', 'Checking spending policy...')
    await delay(1200)
    updateNode('preflight', { status: 'done', detail: '✓ Within limits', duration: '1.2s' })
    addLog('OK', `Policy check passed: $${tool.price} < max $${maxPerCall}`)
    
    // Ball: Pre-flight → x402 Pay (amber, slower - it's a payment!)
    triggerTravelingBall(1, 2, 'slow', '#FFB547')
    await delay(800)
    
    // Node 3: x402 Pay
    updateNode('x402pay', { status: 'running', detail: 'Signing USDC payment...' })
    addLog('PAY', `Initiating x402 payment: ${tool.price} USDC`)
    await delay(900)
    updateNode('x402pay', { detail: 'Coinbase verifying...' })
    addLog('INF', 'Payment verification in progress...')
    await delay(900)
    updateNode('x402pay', { status: 'done', detail: `${tool.price} USDC paid`, duration: '1.8s' })
    addLog('OK', `Payment confirmed: ${tool.price} USDC to ${tool.provider}`)
    
    // Ball: x402 Pay → MCP Run (green, fast - payment unlocked access!)
    triggerTravelingBall(2, 3, 'fast', '#00FF88')
    await delay(400)
    
    // Node 4: MCP Run
    updateNode('mcprun', { status: 'running', detail: 'Running security scan...' })
    addLog('INF', `Executing ${tool.name}...`)
    await delay(1100)
    updateNode('mcprun', { detail: 'Analyzing bytecode...' })
    await delay(1100)
    const vulns = Math.floor(Math.random() * 5) + 1
    updateNode('mcprun', { status: 'done', detail: `${vulns} vulns found`, duration: '2.2s' })
    addLog('OK', `Scan complete: ${vulns} vulnerabilities detected`)
    
    // Ball: MCP Run → CRE Check (green, normal, slightly larger "data packet")
    triggerTravelingBall(3, 4, 'normal', '#00FF88')
    await delay(600)
    
    // Node 5: CRE Check
    updateNode('crecheck', { status: 'running', detail: 'DON consensus...' })
    addLog('INF', 'Chainlink CRE verification starting...')
    await delay(1000)
    updateNode('crecheck', { status: 'done', detail: 'Quality: 85/100', duration: '1.0s' })
    addLog('OK', 'CRE quality score: 85/100')
    
    // Ball: CRE Check → Attest (green, dramatic/slow with throb - on-chain write!)
    triggerTravelingBall(4, 5, 'dramatic', '#00FF88')
    await delay(1000)
    
    // Node 6: Attest
    updateNode('attest', { status: 'running', detail: 'Writing to Base Sepolia...' })
    addLog('INF', 'Creating on-chain attestation...')
    await delay(3000)
    updateNode('attest', { status: 'done', detail: 'TX: 0x6346...e7d8', duration: '3.0s' })
    addLog('OK', 'Attestation TX: 0x6346a8b9c0d1e2f3...e7d8')
    
    // Complete
    setFlowRunning(false)
    setFlowComplete(true)
    
    // Animate quality score
    let score = 0
    const scoreInterval = setInterval(() => {
      score += 5
      setQualityScore(score)
      if (score >= 85) {
        clearInterval(scoreInterval)
        setQualityScore(85)
      }
    }, 50)
    
    // Update balance
    setUsdcBalance(prev => Math.round((prev - tool.price) * 100) / 100)
    setDailySpent(prev => Math.round((prev + tool.price) * 100) / 100)
    
    // Show receipt
    setTimeout(() => {
      setShowReceipt(true)
      // Show toast
      setToast(`MCPay: Paid ${tool.price} USDC for ${tool.name}. Balance: ${(usdcBalance - tool.price).toFixed(2)} USDC`)
      setTimeout(() => setToast(null), 5000)
    }, 500)
  }

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  const getLogColor = (prefix: LogEntry['prefix']) => {
    switch (prefix) {
      case 'INF': return 'text-[#00D4FF]'
      case 'PAY': return 'text-[#FFB547]'
      case 'OK': return 'text-[#00FF88]'
      case 'WRN': return 'text-[#CC3333]'
    }
  }

  return (
    <main className="min-h-screen bg-[#0D0B0A] text-[#F5E6C8] paper-texture">
      {/* Hero Section */}
      <section className="hero-section relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Video Background with warm overlay */}
        <div className="absolute inset-0 sepia-warm">
          <video
            autoPlay
            muted
            loop
            playsInline
            className="w-full h-full object-cover opacity-50"
            poster="/bg-poster.jpg"
          >
            <source src="/bg-video.mp4" type="video/mp4" />
          </video>
        </div>
        
        {/* Robot Mascot Watermark Background */}
        <div className="hero-bg-mascot animate-float-slow" />
        
        {/* Content - z-10 to stay above watermark */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 flex flex-col items-center justify-center">
          {/* Text Content - centered */}
          <div className="text-center max-w-3xl">
            {/* Art Deco Title */}
            <div className="relative inline-block mb-6 art-deco-corners p-4">
              <h1 
                className="text-6xl md:text-8xl lg:text-9xl font-serif font-bold tracking-tight"
                style={{ 
                  textShadow: '0 0 40px rgba(196,166,122,0.3), 0 2px 4px rgba(0,0,0,0.5), 0 0 80px rgba(0,255,136,0.2)'
                }}
              >
                MCPay
              </h1>
            </div>
            
            <p className="text-xl md:text-2xl text-[#8B5CF6] font-mono mb-4 tracking-wider uppercase">
              Universal x402 Payment Gateway
            </p>
            <p className="text-lg md:text-xl text-[#C4A67A] mb-4 font-serif italic tracking-wide">
              Premium MCP Tools for the Modern Agent
            </p>
            <p className="text-base text-[#F5E6C8]/70 mb-12 tracking-wide">
              Your agent pays. Chainlink verifies. On-chain proof.
            </p>
            
            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <button
                onClick={handleConnectWallet}
                disabled={isConnected}
                className={`px-8 py-4 rounded-lg font-mono font-semibold text-lg transition-all ${
                  isConnected 
                    ? 'bg-[#00FF88]/20 text-[#00FF88] border border-[#00FF88]/50 cursor-default'
                    : 'bg-[#00FF88] text-[#0D0B0A] hover:bg-[#00FF88]/90 hover:shadow-[0_0_30px_rgba(0,255,136,0.4),0_0_60px_rgba(196,166,122,0.2)] border border-[#C4A67A]/30'
                }`}
              >
                {isConnected ? '✓ Connected' : 'Connect Wallet'}
              </button>
              <button className="px-8 py-4 rounded-lg font-mono font-semibold text-lg border-2 border-[#C4A67A] text-[#C4A67A] hover:bg-[#C4A67A]/10 hover:shadow-[0_0_20px_rgba(196,166,122,0.3)] transition-all">
                Browse MCPremium Store
              </button>
            </div>
            
            {/* Stats with mechanical counter feel */}
            <div className="flex flex-wrap justify-center gap-6 md:gap-12 mb-8">
              <div className="text-center relative group">
                <div className="text-2xl md:text-3xl font-mono font-bold text-[#00FF88] roll-digit">{displayedServices}+</div>
                <div className="text-sm text-[#F5E6C8] font-serif">x402 Services</div>
                <div className="absolute -bottom-1 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#C4A67A]/30 to-transparent" />
              </div>
              <div className="text-center relative group">
                <div className="text-2xl md:text-3xl font-mono font-bold text-[#00FF88] roll-digit">{displayedTxns}M+</div>
                <div className="text-sm text-[#F5E6C8] font-serif">Agent Txns</div>
                <div className="absolute -bottom-1 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#C4A67A]/30 to-transparent" />
              </div>
              <div className="text-center relative group">
                <div className="text-2xl md:text-3xl font-mono font-bold text-[#00FF88]">$0.0001</div>
                <div className="text-sm text-[#F5E6C8] font-serif">Fees</div>
                <div className="absolute -bottom-1 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#C4A67A]/30 to-transparent" />
              </div>
              <div className="text-center relative group">
                <div className="text-2xl md:text-3xl font-mono font-bold text-[#8B5CF6]">CRE</div>
                <div className="text-sm text-[#F5E6C8] font-serif">Powered by</div>
                <div className="absolute -bottom-1 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#C4A67A]/30 to-transparent" />
              </div>
            </div>
            
            {/* Badges - vintage style */}
            <div className="flex flex-wrap justify-center gap-3">
              {['Chainlink CRE', 'x402', 'Base Sepolia', 'thirdweb'].map((badge) => (
                <span key={badge} className="px-3 py-1 rounded-sm bg-[#1A1612] border border-[#2E2519] text-xs font-mono text-[#C4A67A] shadow-inner">
                  {badge}
                </span>
              ))}
            </div>
          </div>
          
        </div>
        
        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <ChevronRight className="w-6 h-6 text-[#C4A67A]/50 rotate-90" />
        </div>
      </section>

      {/* Sticky Wallet Bar */}
      {isConnected && (
        <div className="sticky top-0 z-50 bg-[#1A1612]/95 backdrop-blur-sm border-b border-[#2A2420] py-3 px-4">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
            {/* Address */}
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-[#00FF88] animate-pulse" />
              <span className="font-mono text-sm text-[#F5E6C8]">0x7B3f...4a2E</span>
              <button 
                onClick={handleCopyAddress}
                className="p-1 hover:bg-[#2A2420] rounded transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-[#00FF88]" /> : <Copy className="w-4 h-4 text-[#C4A67A]/50" />}
              </button>
            </div>
            
            {/* Balances */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="text-[#C4A67A]/60 text-sm font-serif">USDC:</span>
                <span className="font-mono font-semibold text-[#00FF88]">{usdcBalance.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#C4A67A]/60 text-sm font-serif">ETH:</span>
                <span className="font-mono font-semibold text-[#F5E6C8]">{ethBalance.toFixed(2)}</span>
              </div>
              
              {/* Approve Button */}
              <button
                onClick={handleApprove}
                disabled={isApproved}
                className={`px-4 py-2 rounded-lg font-mono text-sm font-semibold transition-all ${
                  isApproved 
                    ? 'bg-[#00FF88]/20 text-[#00FF88] border border-[#00FF88]/50'
                    : 'bg-[#FFB547] text-[#0D0B0A] hover:bg-[#FFB547]/90 border border-[#C4A67A]'
                }`}
              >
                {isApproved ? '✓ Approved' : 'Approve USDC'}
              </button>
            </div>
            
            {/* Daily Limit */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-[#C4A67A]/60 font-serif">Daily:</span>
              <span className="font-mono text-sm text-[#F5E6C8]">{dailySpent.toFixed(2)} / 5.00 USDC</span>
              <div className="w-24 h-2 bg-[#2A2420] rounded-full overflow-hidden border border-[#3A3430]">
                <div 
                  className="h-full bg-[#00FF88] transition-all duration-500"
                  style={{ width: `${(dailySpent / 5) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Art Deco Divider */}
      <div className="py-8">
        <div className="art-deco-divider max-w-4xl mx-auto" />
      </div>

      {/* MCPremium Store */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-serif font-bold mb-2 text-center">
            MCPremium Store — <span className="text-[#8B5CF6]">Verified Agent Tools</span>
          </h2>
          <p className="text-[#C4A67A]/80 text-center mb-12 font-serif italic">
            Premium MCP tools verified by Chainlink CRE
          </p>
          
          {/* Filters */}
          <div className="flex flex-wrap justify-center gap-3 mb-12">
            {[
              { key: 'all', label: 'All' },
              { key: 'security', label: 'Security' },
              { key: 'data', label: 'Data' },
              { key: 'ai', label: 'AI' },
              { key: 'infra', label: 'Infra' },
            ].map((filter) => (
              <button
                key={filter.key}
                onClick={() => setActiveFilter(filter.key)}
                className={`px-4 py-2 rounded-sm font-mono text-sm transition-all border ${
                  activeFilter === filter.key
                    ? 'bg-[#00FF88] text-[#0D0B0A] border-[#00FF88]'
                    : 'bg-[#1A1612] border-[#2A2420] hover:border-[#C4A67A]/50 text-[#F5E6C8]'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
          
          {/* Tool Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTools.map((tool) => (
              <div
                key={tool.id}
                className="card-glow bg-[#1A1612] rounded-sm overflow-hidden border border-[#2A2420] hover:border-[#C4A67A]/50"
                style={{ '--glow-color': categoryColors[tool.category] + '30' } as React.CSSProperties}
              >
                {/* Category stripe - vintage label style */}
                <div 
                  className="h-2 rounded-b-sm mx-4 mt-0 shadow-lg"
                  style={{ backgroundColor: categoryColors[tool.category] }}
                />
                
                <div className="p-6">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{tool.emoji}</span>
                      <div>
                        <h3 className="font-mono font-semibold text-lg text-[#F5E6C8]">{tool.name}</h3>
                        <p className="text-sm text-[#C4A67A]/70 flex items-center gap-1">
                          <span className="text-xs">🤖</span> {tool.provider}
                        </p>
                      </div>
                    </div>
                    <span 
                      className="px-2 py-1 rounded-sm text-xs font-mono flex items-center gap-1"
                      style={{ backgroundColor: categoryColors[tool.category] + '20', color: categoryColors[tool.category] }}
                    >
                      {categoryIcons[tool.category]}
                      {tool.category}
                    </span>
                  </div>
                  
                  {/* Description */}
                  <p className="text-[#F5E6C8]/70 text-sm mb-4 font-serif">{tool.description}</p>
                  
                  {/* Price & Attestations */}
                  <div className="flex items-center justify-between mb-4">
                    {/* Price tag with hanging effect */}
                    <div className="price-tag">
                      <span className="px-3 py-1 rounded-sm bg-[#FFB547]/20 text-[#FFB547] font-mono text-sm font-semibold border border-[#FFB547]/30">
                        ${tool.price.toFixed(2)}/call
                      </span>
                    </div>
                    {/* CRE Verified stamp */}
                    <div className="vintage-stamp flex items-center gap-2 text-sm px-2 py-1 border-2 border-[#00FF88]/50 rounded-full bg-[#00FF88]/10">
                      <div className="w-2 h-2 rounded-full bg-[#00FF88]" />
                      <span className="text-[#00FF88] font-mono text-xs">CRE ✓</span>
                      <span className="text-[#C4A67A]/70 text-xs">({tool.attestations})</span>
                    </div>
                  </div>
                  
                  {/* Buy Button - with brass border */}
                  <button
                    onClick={() => handleBuy(tool)}
                    className="w-full py-3 rounded-sm bg-[#00FF88] text-[#0D0B0A] font-mono font-semibold hover:bg-[#00FF88]/90 transition-all hover:shadow-[0_0_20px_rgba(0,255,136,0.3),0_0_40px_rgba(196,166,122,0.2)] border border-[#C4A67A]/50"
                  >
                    Buy with MCPay
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Art Deco Divider */}
      <div className="py-8">
        <div className="art-deco-divider max-w-4xl mx-auto" />
      </div>

      {/* Flow Visualization */}
      <section ref={flowRef} className="py-20 px-4 bg-[#0D0B0A]">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-serif font-bold mb-2 text-center">
            Payment Flow — <span className="text-[#00FF88]">Watch MCPay in Action</span>
          </h2>
          <p className="text-[#C4A67A]/80 text-center mb-12 font-serif italic">
            {selectedTool ? `Processing ${selectedTool.name}...` : 'Click "Buy with MCPay" on any tool to see the flow'}
          </p>
          
          {/* Flow Nodes - Responsive layout: horizontal on md+, vertical on mobile */}
          <div className="relative overflow-visible pb-12 mb-8 px-5">
            {/* Desktop/Tablet: Horizontal layout with justify-between */}
            <div className="hidden md:flex items-center justify-between w-full">
              {flowNodes.length > 0 ? flowNodes.map((node, index) => (
                <div key={node.id} className="flex items-center flex-1">
                  {/* Node - Responsive gauge: 80px on md, 100px on lg+ */}
                  <div className="relative flex-shrink-0">
                    {/* Pop ring effect on activation */}
                    {activatingNode === node.id && (
                      <div 
                        className="absolute inset-0 rounded-full border-4 border-[#FFB547] pop-ring"
                        style={{ zIndex: 0 }}
                      />
                    )}
                    
                    <div 
                      className={`relative w-20 h-20 lg:w-24 lg:h-24 rounded-full border-3 lg:border-4 flex flex-col items-center justify-center node-ring-transition ${
                        node.status === 'pending' ? 'border-[#2A2420] bg-[#1A1612]' :
                        node.status === 'running' ? 'border-[#FFB547] bg-[#FFB547]/10 pulse-glow vacuum-tube-on' :
                        'border-[#00FF88] bg-[#00FF88]/10 shadow-[0_0_20px_rgba(0,255,136,0.3),inset_0_0_15px_rgba(0,255,136,0.2)]'
                      } ${activatingNode === node.id ? 'node-activate' : ''} ${successNode === node.id ? 'node-success-flash' : ''}`}
                      style={{ 
                        color: node.status === 'running' ? '#FFB547' : node.status === 'done' ? '#00FF88' : '#C4A67A',
                        boxShadow: node.status === 'done' ? '0 0 20px rgba(0,255,136,0.3), inset 0 0 15px rgba(0,255,136,0.2)' : undefined
                      }}
                    >
                      {/* Inner ring for gauge effect */}
                      <div className={`absolute inset-1.5 lg:inset-2 rounded-full border lg:border-2 node-ring-transition ${
                        node.status === 'pending' ? 'border-[#2A2420]/50' :
                        node.status === 'running' ? 'border-[#FFB547]/30' :
                        'border-[#00FF88]/30'
                      }`} />
                      <span className="text-lg lg:text-xl mb-0.5 relative z-10">{node.icon}</span>
                      <span className="font-mono text-[10px] lg:text-xs font-semibold relative z-10">{node.label}</span>
                      <span className="font-mono text-[8px] lg:text-[9px] text-center px-1 mt-0.5 opacity-70 line-clamp-2 relative z-10">{node.detail}</span>
                      {node.duration && (
                        <span className="absolute -bottom-6 lg:-bottom-8 font-mono text-[9px] lg:text-[10px] text-[#00FF88]">{node.duration}</span>
                      )}
                    </div>
                  </div>
                  
                  {/* Connection Line - Flex to fill remaining space */}
                  {index < flowNodes.length - 1 && (
                    <div className="relative flex-1 h-2 lg:h-3 mx-1 lg:mx-2 min-w-4">
                      {/* Base connection line */}
                      <div 
                        className={`absolute inset-0 rounded-full transition-all duration-300 ${
                          completedConnections.includes(index) 
                            ? 'connection-complete-pulse' 
                            : node.status === 'done' && flowNodes[index + 1].status === 'pending'
                            ? 'connection-idle'
                            : ''
                        }`}
                        style={{ 
                          background: completedConnections.includes(index) 
                            ? 'rgba(0, 255, 136, 0.3)' 
                            : travelingBall && travelingBall.from === index
                            ? `linear-gradient(90deg, ${travelingBall.color}40, ${travelingBall.color}80, ${travelingBall.color}40)`
                            : flowNodes[index + 1].status !== 'pending' 
                            ? '#B87333' 
                            : '#2E2519',
                          boxShadow: travelingBall && travelingBall.from === index
                            ? `0 0 10px ${travelingBall.color}, 0 0 20px ${travelingBall.color}40`
                            : flowNodes[index + 1].status !== 'pending' 
                            ? 'inset 0 -2px 4px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.1)' 
                            : 'none',
                          border: node.status === 'pending' && flowNodes[index + 1].status === 'pending' 
                            ? '1px dashed #2E2519' 
                            : 'none'
                        }}
                      />
                      
                      {/* Traveling ball */}
                      {travelingBall && travelingBall.from === index && (
                        <div 
                          className={`absolute top-1/2 -translate-y-1/2 rounded-full ${
                            travelingBall.speed === 'fast' ? 'travel-ball-fast' :
                            travelingBall.speed === 'slow' ? 'travel-ball-slow' :
                            travelingBall.speed === 'dramatic' ? 'travel-ball-dramatic ball-throb' :
                            'travel-ball'
                          }`}
                          style={{ 
                            width: index === 3 ? '12px' : '10px',
                            height: index === 3 ? '12px' : '10px',
                            backgroundColor: travelingBall.color,
                            boxShadow: `0 0 12px ${travelingBall.color}, 0 0 24px ${travelingBall.color}80`,
                            color: travelingBall.color,
                            left: 0
                          }}
                        />
                      )}
                      
                      {/* Loading dots (waiting state) */}
                      {node.status === 'running' && flowNodes[index + 1].status === 'pending' && (
                        <div className="absolute inset-0 flex items-center justify-center gap-1">
                          <span className="loading-dot" />
                          <span className="loading-dot" />
                          <span className="loading-dot" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )) : (
                // Placeholder nodes - Desktop
                ['OpenClaw', 'Pre-flight', 'x402 Pay', 'MCP Run', 'CRE Check', 'Attest'].map((label, index) => (
                  <div key={label} className="flex items-center flex-1">
                    <div className="relative w-20 h-20 lg:w-24 lg:h-24 rounded-full border-3 lg:border-4 border-[#2A2420] bg-[#1A1612] flex flex-col items-center justify-center opacity-50 flex-shrink-0">
                      <div className="absolute inset-1.5 lg:inset-2 rounded-full border lg:border-2 border-[#2A2420]/50" />
                      <span className="text-lg lg:text-xl mb-0.5">{['🤖', '🛡️', '💰', '⚡', '✅', '⛓️'][index]}</span>
                      <span className="font-mono text-[10px] lg:text-xs text-[#C4A67A]">{label}</span>
                    </div>
                    {index < 5 && (
                      <div className="flex-1 h-2 lg:h-3 mx-1 lg:mx-2 bg-[#2A2420] rounded-full min-w-4" />
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Mobile: Vertical stacked layout */}
            <div className="flex md:hidden flex-col items-center gap-2">
              {flowNodes.length > 0 ? flowNodes.map((node, index) => (
                <div key={node.id} className="flex flex-col items-center">
                  {/* Node */}
                  <div className="relative">
                    {activatingNode === node.id && (
                      <div className="absolute inset-0 rounded-full border-4 border-[#FFB547] pop-ring" style={{ zIndex: 0 }} />
                    )}
                    <div 
                      className={`relative w-20 h-20 rounded-full border-3 flex flex-col items-center justify-center node-ring-transition ${
                        node.status === 'pending' ? 'border-[#2A2420] bg-[#1A1612]' :
                        node.status === 'running' ? 'border-[#FFB547] bg-[#FFB547]/10 pulse-glow vacuum-tube-on' :
                        'border-[#00FF88] bg-[#00FF88]/10'
                      } ${activatingNode === node.id ? 'node-activate' : ''} ${successNode === node.id ? 'node-success-flash' : ''}`}
                      style={{ 
                        color: node.status === 'running' ? '#FFB547' : node.status === 'done' ? '#00FF88' : '#C4A67A',
                        boxShadow: node.status === 'done' ? '0 0 15px rgba(0,255,136,0.3)' : undefined
                      }}
                    >
                      <div className={`absolute inset-1.5 rounded-full border node-ring-transition ${
                        node.status === 'pending' ? 'border-[#2A2420]/50' :
                        node.status === 'running' ? 'border-[#FFB547]/30' :
                        'border-[#00FF88]/30'
                      }`} />
                      <span className="text-lg mb-0.5 relative z-10">{node.icon}</span>
                      <span className="font-mono text-[10px] font-semibold relative z-10">{node.label}</span>
                      <span className="font-mono text-[8px] text-center px-1 opacity-70 line-clamp-1 relative z-10">{node.detail}</span>
                    </div>
                  </div>
                  
                  {/* Vertical connection line */}
                  {index < flowNodes.length - 1 && (
                    <div className="relative w-2 h-8 my-1">
                      <div 
                        className="absolute inset-0 rounded-full transition-all duration-300"
                        style={{ 
                          background: completedConnections.includes(index) 
                            ? 'rgba(0, 255, 136, 0.3)' 
                            : flowNodes[index + 1].status !== 'pending' 
                            ? '#B87333' 
                            : '#2E2519'
                        }}
                      />
                      {/* Vertical traveling ball */}
                      {travelingBall && travelingBall.from === index && (
                        <div 
                          className="absolute left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full travel-ball"
                          style={{ 
                            backgroundColor: travelingBall.color,
                            boxShadow: `0 0 8px ${travelingBall.color}`,
                            top: 0,
                            animation: 'travel-ball-vertical 600ms ease-in-out forwards'
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
              )) : (
                // Placeholder nodes - Mobile
                ['OpenClaw', 'Pre-flight', 'x402 Pay', 'MCP Run', 'CRE Check', 'Attest'].map((label, index) => (
                  <div key={label} className="flex flex-col items-center">
                    <div className="relative w-20 h-20 rounded-full border-3 border-[#2A2420] bg-[#1A1612] flex flex-col items-center justify-center opacity-50">
                      <div className="absolute inset-1.5 rounded-full border border-[#2A2420]/50" />
                      <span className="text-lg mb-0.5">{['🤖', '🛡️', '💰', '⚡', '✅', '⛓️'][index]}</span>
                      <span className="font-mono text-[10px] text-[#C4A67A]">{label}</span>
                    </div>
                    {index < 5 && (
                      <div className="w-2 h-8 my-1 bg-[#2A2420] rounded-full" />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
          
          {/* Terminal Logs - Vintage CRT monitor style */}
          <div className="max-w-4xl mx-auto">
            <div className="relative bg-[#0D0B0A] rounded-lg border-4 border-[#2A2420] overflow-hidden crt-scanlines" style={{ boxShadow: 'inset 0 0 30px rgba(0,0,0,0.5)' }}>
              {/* Terminal plate header */}
              <div className="terminal-plate flex items-center justify-between px-4 py-2 border-b-2 border-[#3A3430]">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-[#C4A67A]" />
                  <span className="font-mono text-sm text-[#C4A67A]">mcpay-terminal</span>
                </div>
                <span className="font-serif text-xs text-[#C4A67A]/50 tracking-wider">MCPAY SYSTEMS · EST. 2026</span>
              </div>
              <div 
                ref={logsRef}
                className="h-48 overflow-y-auto p-4 font-mono text-sm"
              >
                {logs.length > 0 ? logs.map((log, index) => (
                  <div key={index} className="flex gap-2 mb-1">
                    <span className="text-[#C4A67A]/40">{log.timestamp}</span>
                    <span className={getLogColor(log.prefix)}>[{log.prefix}]</span>
                    <span className="text-[#F5E6C8]/80">{log.message}</span>
                  </div>
                )) : (
                  <div className="text-[#C4A67A]/40">Waiting for transaction...</div>
                )}
              </div>
            </div>
          </div>
          
          {/* Receipt Card */}
          {showReceipt && selectedTool && (
            <div className="max-w-md mx-auto mt-8 bg-[#1A1612] rounded-sm border-2 border-[#00FF88]/50 shadow-[0_0_30px_rgba(0,255,136,0.2),0_0_60px_rgba(196,166,122,0.1)] overflow-hidden">
              <div className="p-6">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-3 h-3 rounded-full bg-[#00FF88] animate-pulse" />
                  <h3 className="font-serif font-semibold text-[#00FF88]">Transaction Complete</h3>
                </div>
                
                <div className="space-y-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[#C4A67A]/80 font-serif">Payment TX:</span>
                    <a href="https://sepolia.basescan.org/tx/0xa1b2c3d4e5f6" target="_blank" rel="noopener noreferrer" className="font-mono text-[#8B5CF6] hover:underline flex items-center gap-1">
                      0xa1b2...f678 <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#C4A67A]/80 font-serif">Attestation TX:</span>
                    <a href="https://sepolia.basescan.org/tx/0x6346a8b9c0d1" target="_blank" rel="noopener noreferrer" className="font-mono text-[#8B5CF6] hover:underline flex items-center gap-1">
                      0x6346...e7d8 <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#C4A67A]/80 font-serif">Quality Score:</span>
                    <span className="font-mono text-[#00FF88] font-semibold">{qualityScore}/100</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#C4A67A]/80 font-serif">Amount Paid:</span>
                    <span className="font-mono text-[#FFB547] font-semibold">{selectedTool.price} USDC</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#C4A67A]/80 font-serif">Time:</span>
                    <span className="font-mono text-[#F5E6C8]">9.8s total</span>
                  </div>
                </div>
                
                <button className="w-full mt-6 py-3 rounded-sm border-2 border-[#8B5CF6] text-[#8B5CF6] font-mono font-semibold hover:bg-[#8B5CF6]/10 transition-all">
                  View on ShieldVault
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Art Deco Divider */}
      <div className="py-8">
        <div className="art-deco-divider max-w-4xl mx-auto" />
      </div>

      {/* Agent Dashboard */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-serif font-bold mb-12 text-center">
            Agent Dashboard
          </h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Agent Spending - Vintage gauge style */}
            <div className="bg-[#1A1612] rounded-sm border border-[#2A2420] p-6">
              <h3 className="font-serif font-semibold text-lg mb-6 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-[#00FF88]" />
                <span className="text-[#F5E6C8]">Agent Spending</span>
              </h3>
              
              {/* Circular Chart - Vintage gauge */}
              <div className="flex items-center justify-center mb-8">
                <div className="relative w-52 h-52">
                  {/* Outer decorative ring */}
                  <div className="absolute inset-0 rounded-full border-4 border-[#2A2420]" />
                  {/* Tick marks ring */}
                  <div className="absolute inset-2 rounded-full" style={{
                    background: `conic-gradient(from 0deg, ${Array.from({length: 36}, (_, i) => 
                      `transparent ${i * 10}deg, transparent ${i * 10 + 8}deg, rgba(196,166,122,0.2) ${i * 10 + 8}deg, rgba(196,166,122,0.2) ${i * 10 + 10}deg`
                    ).join(', ')})`
                  }} />
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="104"
                      cy="104"
                      r="80"
                      fill="none"
                      stroke="#2A2420"
                      strokeWidth="16"
                    />
                    <circle
                      cx="104"
                      cy="104"
                      r="80"
                      fill="none"
                      stroke="#00FF88"
                      strokeWidth="16"
                      strokeDasharray={`${(dailySpent / 5) * 502} 502`}
                      strokeLinecap="round"
                      className="transition-all duration-500"
                      style={{ filter: 'drop-shadow(0 0 8px rgba(0, 255, 136, 0.5))' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-mono font-bold text-[#00FF88]">{dailySpent.toFixed(2)}</span>
                    <span className="text-sm text-[#C4A67A]/80 font-serif">/ 5.00 USDC</span>
                  </div>
                </div>
              </div>
              
              {/* Policy Settings */}
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-[#C4A67A]/80 mb-2 block font-serif">Max per call (USDC)</label>
                  <input
                    type="text"
                    value={maxPerCall}
                    onChange={(e) => setMaxPerCall(e.target.value)}
                    className="w-full bg-[#0D0B0A] border border-[#2A2420] rounded-sm px-4 py-2 font-mono text-[#F5E6C8] focus:border-[#C4A67A] focus:outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="text-sm text-[#C4A67A]/80 mb-2 block font-serif">Max per day (USDC)</label>
                  <input
                    type="text"
                    value={maxPerDay}
                    onChange={(e) => setMaxPerDay(e.target.value)}
                    className="w-full bg-[#0D0B0A] border border-[#2A2420] rounded-sm px-4 py-2 font-mono text-[#F5E6C8] focus:border-[#C4A67A] focus:outline-none transition-colors"
                  />
                </div>
                {/* Brass button style */}
                <button className="w-full py-3 rounded-sm brass-button text-[#0D0B0A] font-mono font-semibold">
                  Update Policy
                </button>
              </div>
            </div>
            
            {/* Recent Transactions - Vintage ledger style */}
            <div className="bg-[#1A1612] rounded-sm border border-[#2A2420] p-6">
              <h3 className="font-serif font-semibold text-lg mb-6 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[#FFB547]" />
                <span className="text-[#F5E6C8]">Recent Transactions</span>
              </h3>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-sm text-[#C4A67A] border-b-2 border-[#2A2420]">
                      <th className="pb-3 font-serif">Time</th>
                      <th className="pb-3 font-serif">Tool</th>
                      <th className="pb-3 font-serif">Amount</th>
                      <th className="pb-3 font-serif">Quality</th>
                      <th className="pb-3 font-serif">Status</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {selectedTool && flowComplete && (
                      <tr className="ledger-row border-b border-[#2A2420] bg-[#00FF88]/5">
                        <td className="py-3 font-mono text-[#C4A67A]/70">Just now</td>
                        <td className="py-3 font-mono text-[#F5E6C8]">{selectedTool.name}</td>
                        <td className="py-3 font-mono text-[#FFB547]">${selectedTool.price.toFixed(2)}</td>
                        <td className="py-3 font-mono text-[#00FF88]">85/100</td>
                        <td className="py-3">
                          <span className="px-2 py-1 rounded-sm bg-[#00FF88]/20 text-[#00FF88] text-xs border border-[#00FF88]/30">Verified</span>
                        </td>
                      </tr>
                    )}
                    <tr className="ledger-row border-b border-[#2A2420]">
                      <td className="py-3 font-mono text-[#C4A67A]/70">2m ago</td>
                      <td className="py-3 font-mono text-[#F5E6C8]">check-address</td>
                      <td className="py-3 font-mono text-[#FFB547]">$0.02</td>
                      <td className="py-3 font-mono text-[#00FF88]">92/100</td>
                      <td className="py-3">
                        <span className="px-2 py-1 rounded-sm bg-[#00FF88]/20 text-[#00FF88] text-xs border border-[#00FF88]/30">Verified</span>
                      </td>
                    </tr>
                    <tr className="ledger-row border-b border-[#2A2420]">
                      <td className="py-3 font-mono text-[#C4A67A]/70">5m ago</td>
                      <td className="py-3 font-mono text-[#F5E6C8]">gas-oracle</td>
                      <td className="py-3 font-mono text-[#FFB547]">$0.01</td>
                      <td className="py-3 font-mono text-[#00FF88]">88/100</td>
                      <td className="py-3">
                        <span className="px-2 py-1 rounded-sm bg-[#00FF88]/20 text-[#00FF88] text-xs border border-[#00FF88]/30">Verified</span>
                      </td>
                    </tr>
                    <tr className="ledger-row border-b border-[#2A2420]">
                      <td className="py-3 font-mono text-[#C4A67A]/70">12m ago</td>
                      <td className="py-3 font-mono text-[#F5E6C8]">defi-analytics</td>
                      <td className="py-3 font-mono text-[#FFB547]">$0.03</td>
                      <td className="py-3 font-mono text-[#FFB547]">67/100</td>
                      <td className="py-3">
                        <span className="px-2 py-1 rounded-sm bg-[#FFB547]/20 text-[#FFB547] text-xs border border-[#FFB547]/30">Disputed</span>
                      </td>
                    </tr>
                    <tr className="ledger-row">
                      <td className="py-3 font-mono text-[#C4A67A]/70">18m ago</td>
                      <td className="py-3 font-mono text-[#F5E6C8]">ai-sentiment</td>
                      <td className="py-3 font-mono text-[#FFB547]">$0.04</td>
                      <td className="py-3 font-mono text-[#00FF88]">79/100</td>
                      <td className="py-3">
                        <span className="px-2 py-1 rounded-sm bg-[#00FF88]/20 text-[#00FF88] text-xs border border-[#00FF88]/30">Verified</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Art Deco Divider */}
      <div className="py-8">
        <div className="art-deco-divider max-w-4xl mx-auto" />
      </div>

      {/* SDK Install - Vintage telegraph machine style */}
      <section className="py-20 px-4 bg-[#0D0B0A]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-serif font-bold mb-2 text-center">
            Integrate MCPay in Your Agent
          </h2>
          <p className="text-[#C4A67A]/80 text-center mb-12 font-serif italic">
            3 lines to verified x402 payments
          </p>
          
          {/* Install Command - Vintage terminal */}
          <div className="bg-[#0D0B0A] rounded-sm border-4 border-[#2A2420] overflow-hidden mb-6" style={{ boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)' }}>
            {/* Header plate */}
            <div className="terminal-plate flex items-center justify-between px-4 py-2 border-b-2 border-[#3A3430]">
              <span className="font-serif text-sm text-[#C4A67A] tracking-wider">MCPAY DEVELOPMENT KIT</span>
              <button 
                onClick={handleCopyCode}
                className="p-1 hover:bg-[#2A2420] rounded transition-colors"
              >
                {copiedCode ? <Check className="w-4 h-4 text-[#00FF88]" /> : <Copy className="w-4 h-4 text-[#C4A67A]/50" />}
              </button>
            </div>
            <div className="p-4 font-mono text-sm">
              <span className="text-[#00FF88]">$</span> <span className="text-[#F5E6C8]">npm install mcpay-sdk</span>
            </div>
          </div>
          
          {/* Usage Example */}
          <div className="relative bg-[#0D0B0A] rounded-sm border-4 border-[#2A2420] overflow-hidden crt-scanlines" style={{ boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)' }}>
            <div className="terminal-plate flex items-center px-4 py-2 border-b-2 border-[#3A3430]">
              <span className="font-mono text-sm text-[#C4A67A]">agent.ts</span>
            </div>
            <pre className="p-4 font-mono text-sm overflow-x-auto">
              <code>
                <span className="text-[#8B5CF6]">import</span>{' '}
                <span className="text-[#F5E6C8]">{'{ MCPayClient }'}</span>{' '}
                <span className="text-[#8B5CF6]">from</span>{' '}
                <span className="text-[#00FF88]">{`'mcpay-sdk'`}</span>
                {'\n\n'}
                <span className="text-[#8B5CF6]">const</span>{' '}
                <span className="text-[#FFB547]">mcpay</span>{' '}
                <span className="text-[#F5E6C8]">=</span>{' '}
                <span className="text-[#8B5CF6]">new</span>{' '}
                <span className="text-[#00D4FF]">MCPayClient</span>
                <span className="text-[#F5E6C8]">{'({'}</span>
                {'\n'}
                <span className="text-[#F5E6C8]">{'  '}</span>
                <span className="text-[#F5E6C8]">wallet:</span>{' '}
                <span className="text-[#FFB547]">agentPrivateKey</span>
                <span className="text-[#F5E6C8]">,</span>
                {'\n'}
                <span className="text-[#F5E6C8]">{'  '}</span>
                <span className="text-[#F5E6C8]">network:</span>{' '}
                <span className="text-[#00FF88]">{`'base-sepolia'`}</span>
                <span className="text-[#F5E6C8]">,</span>
                {'\n'}
                <span className="text-[#F5E6C8]">{'})'}</span>
                {'\n\n'}
                <span className="text-[#8B5CF6]">const</span>{' '}
                <span className="text-[#FFB547]">result</span>{' '}
                <span className="text-[#F5E6C8]">=</span>{' '}
                <span className="text-[#8B5CF6]">await</span>{' '}
                <span className="text-[#FFB547]">mcpay</span>
                <span className="text-[#F5E6C8]">.</span>
                <span className="text-[#00D4FF]">buy</span>
                <span className="text-[#F5E6C8]">{'({'}</span>
                {'\n'}
                <span className="text-[#F5E6C8]">{'  '}</span>
                <span className="text-[#F5E6C8]">tool:</span>{' '}
                <span className="text-[#00FF88]">{`'scan-contract'`}</span>
                <span className="text-[#F5E6C8]">,</span>
                {'\n'}
                <span className="text-[#F5E6C8]">{'  '}</span>
                <span className="text-[#F5E6C8]">args:</span>{' '}
                <span className="text-[#F5E6C8]">{'{ '}</span>
                <span className="text-[#F5E6C8]">address:</span>{' '}
                <span className="text-[#00FF88]">{`'0xdead...'`}</span>
                <span className="text-[#F5E6C8]">{' }'}</span>
                <span className="text-[#F5E6C8]">,</span>
                {'\n'}
                <span className="text-[#F5E6C8]">{'})'}</span>
                {'\n\n'}
                <span className="text-[#C4A67A]/50">{'// On-chain proof included'}</span>
                {'\n'}
                <span className="text-[#FFB547]">console</span>
                <span className="text-[#F5E6C8]">.</span>
                <span className="text-[#00D4FF]">log</span>
                <span className="text-[#F5E6C8]">(</span>
                <span className="text-[#FFB547]">result</span>
                <span className="text-[#F5E6C8]">.</span>
                <span className="text-[#F5E6C8]">txHash</span>
                <span className="text-[#F5E6C8]">)</span>
                <span className="text-[#C4A67A]/50">{'       // Payment TX'}</span>
                {'\n'}
                <span className="text-[#FFB547]">console</span>
                <span className="text-[#F5E6C8]">.</span>
                <span className="text-[#00D4FF]">log</span>
                <span className="text-[#F5E6C8]">(</span>
                <span className="text-[#FFB547]">result</span>
                <span className="text-[#F5E6C8]">.</span>
                <span className="text-[#F5E6C8]">attestation</span>
                <span className="text-[#F5E6C8]">)</span>
                <span className="text-[#C4A67A]/50">{'  // CRE attestation TX'}</span>
                {'\n'}
                <span className="text-[#FFB547]">console</span>
                <span className="text-[#F5E6C8]">.</span>
                <span className="text-[#00D4FF]">log</span>
                <span className="text-[#F5E6C8]">(</span>
                <span className="text-[#FFB547]">result</span>
                <span className="text-[#F5E6C8]">.</span>
                <span className="text-[#F5E6C8]">quality</span>
                <span className="text-[#F5E6C8]">)</span>
                <span className="text-[#C4A67A]/50">{'     // 85/100'}</span>
              </code>
            </pre>
          </div>
        </div>
      </section>

      {/* Art Deco Divider */}
      <div className="py-8">
        <div className="art-deco-divider max-w-4xl mx-auto" />
      </div>

      {/* Footer - Vintage plaque style */}
      <footer className="py-12 px-4 border-t border-[#2A2420]">
        <div className="max-w-7xl mx-auto text-center">
          {/* Vintage plaque */}
          <div className="inline-flex items-center gap-3 px-6 py-3 bg-[#1A1612] border-2 border-[#C4A67A]/30 rounded-sm mb-6" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 8px rgba(0,0,0,0.3)' }}>
            <Image
              src="/robot-mascot.png"
              alt="MCPay Robot"
              width={32}
              height={32}
              className="opacity-80"
            />
            <p className="text-[#C4A67A] font-serif">
              Built by <span className="text-[#F5E6C8]">Jawy</span> · <span className="text-[#F5E6C8]">Mantishield</span>
            </p>
          </div>
          
          <div className="flex flex-wrap justify-center gap-6 mb-8">
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-[#C4A67A]/60 hover:text-[#00FF88] transition-colors font-mono text-sm warm-hover px-2 py-1 rounded">
              GitHub
            </a>
            <a href="https://twitter.com/Jawy77" target="_blank" rel="noopener noreferrer" className="text-[#C4A67A]/60 hover:text-[#00FF88] transition-colors font-mono text-sm warm-hover px-2 py-1 rounded">
              @Jawy77
            </a>
            <a href="https://chainlink.com" target="_blank" rel="noopener noreferrer" className="text-[#C4A67A]/60 hover:text-[#00FF88] transition-colors font-mono text-sm warm-hover px-2 py-1 rounded">
              Chainlink Hackathon
            </a>
            <a href="https://thirdweb.com" target="_blank" rel="noopener noreferrer" className="text-[#C4A67A]/60 hover:text-[#00FF88] transition-colors font-mono text-sm warm-hover px-2 py-1 rounded">
              thirdweb
            </a>
          </div>
          
          {/* Vintage expo badge */}
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-sm bg-[#1A1612] border-2 border-[#8B5CF6]/50 vintage-stamp" style={{ boxShadow: 'inset 0 0 10px rgba(139,92,246,0.1)' }}>
            <span className="text-[#8B5CF6] font-serif text-sm tracking-wider">CHAINLINK CONVERGENCE 2026</span>
          </div>
        </div>
      </footer>

      {/* Wallet Modal - Vintage style */}
      {showWalletModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1A1612] rounded-sm border-2 border-[#2A2420] w-full max-w-md mx-4 overflow-hidden" style={{ boxShadow: '0 0 40px rgba(0,0,0,0.5), 0 0 80px rgba(196,166,122,0.1)' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b-2 border-[#2A2420] bg-[#1A1612]">
              <h3 className="font-serif font-semibold text-lg text-[#F5E6C8]">Connect Wallet</h3>
              <button 
                onClick={() => setShowWalletModal(false)}
                className="p-1 hover:bg-[#2A2420] rounded transition-colors"
              >
                <X className="w-5 h-5 text-[#C4A67A]" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <button 
                onClick={handleSelectWallet}
                className="w-full flex items-center gap-4 p-4 rounded-sm bg-[#0D0B0A] border border-[#2A2420] hover:border-[#FFB547] hover:shadow-[0_0_15px_rgba(255,181,71,0.2)] transition-all"
              >
                <div className="w-10 h-10 rounded-sm bg-[#F6851B] flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold text-[#F5E6C8]">MetaMask</span>
              </button>
              <button 
                onClick={handleSelectWallet}
                className="w-full flex items-center gap-4 p-4 rounded-sm bg-[#0D0B0A] border border-[#2A2420] hover:border-[#0052FF] hover:shadow-[0_0_15px_rgba(0,82,255,0.2)] transition-all"
              >
                <div className="w-10 h-10 rounded-sm bg-[#0052FF] flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold text-[#F5E6C8]">Coinbase Wallet</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approval Modal - Vintage style */}
      {showApprovalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1A1612] rounded-sm border-2 border-[#2A2420] w-full max-w-md mx-4 overflow-hidden" style={{ boxShadow: '0 0 40px rgba(0,0,0,0.5), 0 0 80px rgba(196,166,122,0.1)' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b-2 border-[#2A2420]">
              <h3 className="font-serif font-semibold text-lg text-[#F5E6C8]">Approve USDC</h3>
              <button 
                onClick={() => setShowApprovalModal(false)}
                className="p-1 hover:bg-[#2A2420] rounded transition-colors"
              >
                <X className="w-5 h-5 text-[#C4A67A]" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-[#F5E6C8]/70 mb-6 font-serif">
                Allow MCPay to spend up to <span className="text-[#FFB547] font-mono font-semibold">10 USDC</span> on your behalf?
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowApprovalModal(false)}
                  className="flex-1 py-3 rounded-sm border border-[#2A2420] font-mono font-semibold hover:bg-[#2A2420] transition-all text-[#F5E6C8]"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmApproval}
                  className="flex-1 py-3 rounded-sm bg-[#00FF88] text-[#0D0B0A] font-mono font-semibold hover:bg-[#00FF88]/90 transition-all border border-[#C4A67A]/30"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification - Vintage with bounce */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm animate-slide-in">
          <div className="bg-[#1A1612] border-2 border-[#00FF88]/50 rounded-sm p-4 shadow-[0_0_30px_rgba(0,255,136,0.2),0_0_60px_rgba(196,166,122,0.1)]">
            <p className="font-mono text-sm text-[#F5E6C8]">{toast}</p>
          </div>
        </div>
      )}
    </main>
  )
}
