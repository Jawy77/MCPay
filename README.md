# MCPay (ShieldPay): CRE-Verified Trust Layer for Autonomous Agent Payments

> **Chainlink Convergence Hackathon 2026** | CRE & AI | Risk & Compliance | Privacy

## The Problem

The x402 ecosystem has 251+ paid services and 50M+ transactions — but **nobody verifies delivery**. When an AI agent pays $0.05 for an MCP tool via x402, the facilitator confirms the payment settled. But what if the MCP server returns garbage data? Or charges without delivering? Or the agent's wallet drains from repeated micropayments to a malicious server?

**Existing x402 gateways** (Vercel x402-mcp, ElizaOS mcp-gateway, Foldset, Kobaru) all handle payments. None of them verify that the service was actually delivered. The agent pays and trusts blindly.

## The Solution

**MCPay (ShieldPay)** is a CRE-powered trust layer that sits on top of existing x402 infrastructure. It uses Chainlink CRE to orchestrate the complete lifecycle of a paid agent-to-MCP transaction:

1. **Pre-flight check** — CRE reads spending policy from ShieldVault.sol (EVM read)
2. **Payment capture** — Standard x402 USDC flow via Coinbase facilitator
3. **Service delivery** — CRE calls the MCP server via HTTP and captures the response
4. **Quality validation** — Off-chain compute validates response schema and quality scoring
5. **On-chain attestation** — DON consensus writes verifiable proof to ShieldVault.sol on Base Sepolia

The result: every agent payment has an on-chain receipt proving both payment AND delivery.

## Live Demo

| Component | URL |
|-----------|-----|
| **Frontend** | [v0-mcp-ay-payment-gateway.vercel.app](https://v0-mcp-ay-payment-gateway.vercel.app) |
| **Backend API** | [54.221.19.241:4000](http://54.221.19.241:4000/api/health) |
| **Agent Wallet** | [0x7919...0A9A on BaseScan](https://sepolia.basescan.org/address/0x7919b7b50c35121Ab2cD7EAdcB2B467E1deE0A9A) |
| **Network** | Base Sepolia (chainId 84532) |
| **USDC Contract** | [0x036CbD53842c5426634e7929541eC2318f3dCF7e](https://sepolia.basescan.org/token/0x036CbD53842c5426634e7929541eC2318f3dCF7e) |

## Architecture

```
┌─────────────────────┐
│   AI Agent          │  OpenClaw Telegram Bot
│   (MCPay SDK)       │  with Groq LLM backbone
└─────────┬───────────┘
          │ POST /api/buy
          ▼
┌─────────────────────┐     ┌─────────────────────┐
│   MCPay Backend     │────→│   Demo MCP Server   │
│   (EC2 :4000)       │     │   (:3001, x402)     │
│                     │     │                     │
│  1. Pre-flight      │     │  @x402/express      │
│     USDC balance    │     │  paymentMiddleware   │
│  2. x402 Payment    │     │  USDC on Base        │
│     @x402/axios     │     │  Sepolia             │
│  3. MCP Execute     │     └─────────────────────┘
│  4. Quality Score   │
│  5. Attestation     │──→  ShieldVault.sol (Base Sepolia)
└─────────────────────┘

┌─────────────────────┐
│   CRE Workflow      │  ← CHAINLINK: shield-verify
│   (DON Consensus)   │
│                     │
│  1. Pre-flight      │  EVM read → ShieldVault.checkPolicy()
│  2. x402 Verify     │  HTTP → Coinbase facilitator
│  3. MCP Call        │  HTTP → premium MCP server
│  4. Quality Check   │  Off-chain compute → validation
│  5. Attestation     │  EVM write → ShieldVault.attest()
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│   ShieldVault.sol   │  ← CHAINLINK: Base Sepolia
│   (Base Sepolia)    │
│                     │
│  • Attestation      │  paymentHash + serviceHash + qualityScore
│  • Spending Policy  │  maxPerCall + maxDaily
│  • Dispute Signal   │  agent can flag bad attestations
│  • MCP Reputation   │  avgScore + totalCalls + disputes
└─────────────────────┘
```

## Chainlink CRE File Links

> **Required by submission**: Links to ALL files that use Chainlink technology.

| File | Chainlink Component | Purpose |
|------|-------------------|---------|
| [`cre-workflow/workflow/main.ts`](./cre-workflow/workflow/main.ts) | **CRE Workflow (TypeScript)** | Main workflow: HTTP trigger → EVM read (checkPolicy) → HTTP fetch (x402 verify + MCP call) → off-chain quality validation → EVM write (attestation via report) |
| [`cre-workflow/workflow/config.staging.json`](./cre-workflow/workflow/config.staging.json) | **CRE Config** | Staging configuration: ShieldVault address, Base Sepolia chain selector, MCP server URL, facilitator URL |
| [`cre-workflow/workflow/workflow.yaml`](./cre-workflow/workflow/workflow.yaml) | **CRE Workflow Manifest** | Workflow metadata: name, version, language, entrypoint, config targets |
| [`cre-workflow/workflow/package.json`](./cre-workflow/workflow/package.json) | **CRE Dependencies** | `@chainlink/cre-sdk ^1.1.2` + simulate/broadcast scripts |
| [`cre-workflow/contracts/ShieldVault.sol`](./cre-workflow/contracts/ShieldVault.sol) | **Smart Contract (Base Sepolia)** | CRE-verified attestation storage: `attest()` (onlyCRE), `checkPolicy()`, `dispute()`, `getMcpReputation()` |
| [`cre-workflow/contracts/ReceiverTemplate.sol`](./cre-workflow/contracts/ReceiverTemplate.sol) | **CRE Report Receiver** | Base contract for receiving CRE DON consensus reports |
| [`backend/src/api.ts`](./backend/src/api.ts) | **x402 + ShieldVault Integration** | Backend calls ShieldVault.attest() for on-chain attestations after x402 payment |

## CRE Capabilities Used

| CRE Capability | Where | What It Does |
|---------------|-------|-------------|
| **HTTP Trigger** | `main.ts:82` | Agent sends verification request to trigger the workflow |
| **EVM Read** | `main.ts:102-119` | Reads spending policy from ShieldVault.checkPolicy() on Base Sepolia |
| **HTTP Fetch** | `main.ts:128-145` | Verifies x402 payment receipt with Coinbase facilitator |
| **HTTP Fetch** | `main.ts:150-170` | Calls premium MCP server and captures response |
| **Off-chain Compute** | `main.ts:176-212` | Validates MCP response: schema check + content quality + latency scoring |
| **Report (Consensus)** | `main.ts:225-232` | Generates DON-signed report with attestation data |
| **EVM Write** | `main.ts:235-246` | Writes verified attestation to ShieldVault.sol via consensus report |

## Repository Structure

```
MCPay/
├── cre-workflow/                         ← CHAINLINK (primary deliverable)
│   ├── workflow/
│   │   ├── main.ts                       ← CRE Workflow: HTTP trigger → verify → attest
│   │   ├── config.staging.json           ← Base Sepolia configuration
│   │   ├── workflow.yaml                 ← CRE workflow manifest
│   │   └── package.json                  ← @chainlink/cre-sdk dependency
│   └── contracts/
│       ├── ShieldVault.sol               ← CHAINLINK: attestation contract (onlyCRE)
│       └── ReceiverTemplate.sol          ← CRE write receiver base
├── backend/                              ← Express API (EC2: 54.221.19.241:4000)
│   ├── src/api.ts                        ← x402 payments + ShieldVault attestations
│   └── package.json                      ← @x402/axios, viem, express
├── demo-mcp/                             ← Demo premium MCP server (:3001)
│   ├── src/server.ts                     ← x402-priced security scan MCP
│   └── package.json                      ← @x402/express middleware
├── agent/                                ← OpenClaw Telegram Bot
│   ├── src/telegram-bot.ts               ← Groq LLM + MCPay SDK
│   └── package.json
├── demo-app/                             ← Frontend (Vercel)
│   └── app/page.tsx                      ← Retro cyberpunk MCPremium Store UI
├── sdk/                                  ← mcpay-sdk npm package
│   └── src/index.ts                      ← Shield-aware MCP client wrapper
├── foundry.toml                          ← Foundry config for Base Sepolia
└── README.md                             ← This file
```

## What Makes MCPay Different

| Feature | Vercel x402-mcp | ElizaOS Gateway | Foldset | **MCPay** |
|---------|----------------|----------------|---------|-----------|
| x402 Payment | Y | Y | Y | **Y** |
| Service delivery verification | - | - | - | **CRE DON** |
| On-chain attestation | - | - | - | **Base Sepolia** |
| Spending policy enforcement | - | - | - | **On-chain** |
| Dispute resolution | - | - | - | **On-chain proof** |
| MCP server reputation | - | - | - | **On-chain avg score** |

## Quick Start

### Prerequisites

- [CRE CLI](https://docs.chain.link/cre/getting-started/cli-installation) v1.3.0+
- [Bun](https://bun.sh) v1.2+
- [Foundry](https://book.getfoundry.sh/) for smart contract deployment
- Base Sepolia ETH + USDC (testnet faucets: [ETH](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet), [USDC](https://faucet.circle.com))
- CRE account (`cre login`)

### 1. Clone & Install

```bash
git clone https://github.com/Jawy77/MCPay.git
cd MCPay
```

### 2. Deploy ShieldVault Contract

```bash
forge create cre-workflow/contracts/ShieldVault.sol:ShieldVault \
  --rpc-url https://sepolia.base.org \
  --private-key $PRIVATE_KEY \
  --constructor-args $AGENT_WALLET \
  --broadcast
```

### 3. Configure & Simulate CRE Workflow

```bash
cd cre-workflow/workflow
bun install
# Update config.staging.json with deployed ShieldVault address
cre login
cre workflow simulate shield-verify --target staging-settings
```

### 4. Run Backend + MCP Server

```bash
# Terminal 1: MCP Server
cd demo-mcp && npm start

# Terminal 2: Backend API
cd backend && npm start
```

### 5. Run Demo

Visit [v0-mcp-ay-payment-gateway.vercel.app](https://v0-mcp-ay-payment-gateway.vercel.app) and click "Buy with MCPay" to see the full flow.

## Prize Track Alignment

| Track | Prize | How MCPay Qualifies |
|-------|-------|---------------------|
| **CRE & AI** | $17,000 | AI agent (OpenClaw) consumes CRE workflow with x402 micropayments — primary use case |
| **Risk & Compliance** | $16,000 | Automated spending policy enforcement via on-chain checks, quality monitoring |
| **Privacy** | $16,000 | Confidential HTTP for wallet balance checks without exposing keys on-chain |

## Tech Stack

- **CRE SDK**: `@chainlink/cre-sdk` v1.1.2 (TypeScript)
- **Smart Contract**: Solidity 0.8.19 (Foundry) on Base Sepolia
- **x402 Payments**: `@x402/axios` (client), `@x402/express` (server) — USDC on Base Sepolia
- **MCP**: `@modelcontextprotocol/sdk` for premium tool server
- **LLM**: Groq (`llama-3.1-8b-instant`) — NOT Anthropic
- **Frontend**: Next.js 14 on Vercel
- **Backend**: Express.js on EC2
- **Agent**: Telegram Bot API + Groq LLM (OpenClaw)

## Team

**Jawy** — Blockchain Security Specialist | Mantishield Founder
- DevSecOps Analyst & PhD Candidate (Applied Cryptography & FHE)
- Mile2 Forensics Certified
- Builder of OpenClaw/Red Queen autonomous security agent
- Speaker at Ekoparty, DevConnect Argentina, DeFi Security Summit Buenos Aires
- [@Jawy77](https://twitter.com/Jawy77)

## License

MIT
