# ShieldPay: CRE-Verified Trust Layer for Autonomous Agent Payments

> **Chainlink Convergence Hackathon 2026** | CRE & AI · Risk & Compliance · Privacy

## The Problem

The x402 ecosystem has 251+ paid services and 50M+ transactions — but **nobody verifies delivery**. When an AI agent pays $0.05 for an MCP tool via x402, the facilitator confirms the payment settled. But what if the MCP server returns garbage data? Or charges without delivering? Or the agent's wallet drains from repeated micropayments to a malicious server?

**Existing x402 gateways** (Vercel x402-mcp, ElizaOS mcp-gateway, Foldset, Kobaru) all handle payments. None of them verify that the service was actually delivered. The agent pays and trusts blindly.

## The Solution

**ShieldPay** is a CRE-powered trust layer that sits on top of existing x402 infrastructure. It uses Chainlink CRE to orchestrate the complete lifecycle of a paid agent-to-MCP transaction:

1. **Pre-flight check** — CRE verifies wallet balance and spending policies (Confidential HTTP)
2. **Payment capture** — Standard x402 flow via Coinbase facilitator
3. **Service delivery** — CRE calls the MCP server and captures the response
4. **Quality validation** — Off-chain compute validates response schema and quality signals
5. **On-chain attestation** — DON consensus writes verifiable proof to ShieldVault.sol on Base Sepolia

The result: every agent payment has an on-chain receipt proving both payment AND delivery.

## Architecture

```
┌─────────────────────┐
│   AI Agent          │  OpenClaw Telegram Bot
│   (ShieldPay SDK)   │  with Claude backbone
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│   CRE Workflow      │  ← CHAINLINK: shield-verify.ts
│   (DON Consensus)   │
│                     │
│  1. Pre-flight      │  Confidential HTTP → wallet check
│  2. x402 Payment    │  Coinbase facilitator
│  3. MCP Call        │  HTTP capability → premium MCP
│  4. Quality Check   │  Off-chain compute → validation
│  5. Attestation     │  On-chain write → ShieldVault.sol
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│   ShieldVault.sol   │  ← CHAINLINK: Base Sepolia
│   (Base Sepolia)    │
│                     │
│  • Attestation      │  paymentHash + serviceHash + qualityScore
│  • Spending Policy  │  maxPerCall + maxDaily + allowedMCPs
│  • Dispute Signal   │  agent can flag bad attestations
└─────────────────────┘
```

## Chainlink File Links

| File | Chainlink Component | Purpose |
|------|-------------------|---------|
| [`cre-workflow/workflow/main.ts`](./cre-workflow/workflow/main.ts) | **CRE Workflow (TypeScript)** | Main workflow: pre-flight → payment → MCP call → validate → attest |
| [`cre-workflow/workflow/config.staging.json`](./cre-workflow/workflow/config.staging.json) | **CRE Config** | Staging configuration for Base Sepolia |
| [`cre-workflow/workflow/workflow.yaml`](./cre-workflow/workflow/workflow.yaml) | **CRE Workflow Manifest** | Workflow metadata and paths |
| [`cre-workflow/contracts/ShieldVault.sol`](./cre-workflow/contracts/ShieldVault.sol) | **Smart Contract (Base Sepolia)** | On-chain attestation storage + spending policies + disputes |

## Repository Structure

```
ShieldPay/
├── cre-workflow/                         ← CHAINLINK (primary deliverable)
│   ├── workflow/
│   │   ├── main.ts                       ← CRE Workflow: verify + pay + attest
│   │   ├── config.staging.json           ← Base Sepolia configuration
│   │   ├── config.production.json        ← Production config (future)
│   │   ├── workflow.yaml                 ← CRE workflow manifest
│   │   ├── package.json                  ← CRE SDK dependency
│   │   └── tsconfig.json
│   └── contracts/
│       ├── ShieldVault.sol               ← CHAINLINK: attestation contract
│       └── ReceiverTemplate.sol          ← CRE write receiver base
├── sdk/                                  TypeScript SDK
│   ├── src/
│   │   ├── client.ts                     Shield-aware MCP client wrapper
│   │   ├── policies.ts                   Spending limit management
│   │   └── attestation.ts               On-chain attestation reader
│   └── package.json
├── demo-mcp/                             Demo premium MCP server
│   ├── src/
│   │   └── server.ts                     x402-priced security scan MCP
│   └── package.json
├── agent/                                OpenClaw integration
│   ├── src/
│   │   └── telegram-bot.ts              Telegram bot using ShieldPay SDK
│   └── package.json
└── README.md                             This file
```

## Prize Track Alignment

| Track | Prize | How ShieldPay Qualifies |
|-------|-------|----------------------|
| **CRE & AI** | $17,000 | AI agent (OpenClaw) consumes CRE workflow with x402 payments — first listed use case |
| **Risk & Compliance** | $16,000 | Automated spending policy enforcement, quality monitoring, safeguard triggers |
| **Privacy** | $16,000 | Confidential HTTP for wallet balance checks without exposing keys on-chain |
| **Tenderly VTN** | $5,000 | CRE workflows tested on Tenderly Virtual TestNets |
| **Top 10** | $1,500 | Strong CRE usage across multiple capabilities |

## What Makes ShieldPay Different

| Feature | Vercel x402-mcp | ElizaOS Gateway | Foldset | **ShieldPay** |
|---------|----------------|----------------|---------|--------------|
| x402 Payment | ✓ | ✓ | ✓ | ✓ |
| Service delivery verification | ✗ | ✗ | ✗ | **✓ CRE DON** |
| On-chain attestation | ✗ | ✗ | ✗ | **✓ Base Sepolia** |
| Spending policy enforcement | ✗ | ✗ | ✗ | **✓ On-chain** |
| Dispute resolution | ✗ | ✗ | ✗ | **✓ On-chain proof** |
| Confidential API calls | ✗ | ✗ | ✗ | **✓ CRE Conf. HTTP** |

## Quick Start

### Prerequisites

- [CRE CLI](https://docs.chain.link/cre/getting-started/cli-installation) v1.0.11+
- [Bun](https://bun.sh) v1.2.21+
- [Foundry](https://book.getfoundry.sh/) for smart contract deployment
- Base Sepolia ETH + USDC (testnet)
- CRE account (register at [cre.chain.link](https://cre.chain.link))

### 1. Clone & Install

```bash
git clone https://github.com/Jawy77/MCPay.git
cd MCPay
```

### 2. Deploy ShieldVault Contract

```bash
cd cre-workflow/contracts
forge create ShieldVault --rpc-url $BASE_SEPOLIA_RPC --private-key $PRIVATE_KEY
```

### 3. Configure & Simulate CRE Workflow

```bash
cd ../workflow
bun install
cp .env.example .env  # Add your keys
cre workflow simulate shield-verify --target staging-settings
```

### 4. Run Demo

```bash
# Terminal 1: Start demo MCP server
cd demo-mcp && bun run src/server.ts

# Terminal 2: Run agent
cd agent && bun run src/telegram-bot.ts
```

## Demo Video

[Link to 3-5 minute demo video] — Shows:
1. OpenClaw Telegram bot requesting a premium security scan
2. CRE workflow simulation: pre-flight → payment → MCP call → validation
3. On-chain attestation on Base Sepolia Explorer
4. Dispute flow demonstration

## Tech Stack

- **CRE SDK**: `@chainlink/cre-sdk` (TypeScript)
- **Smart Contract**: Solidity (Foundry) on Base Sepolia
- **x402**: `@x402/axios`, `@x402/express` for payment flow
- **MCP**: `@modelcontextprotocol/sdk` for tool server
- **Agent**: Telegram Bot API + Claude backbone (OpenClaw)
- **Testing**: Tenderly Virtual TestNets

## Team

**Jawy** — Blockchain Security Specialist | Mantishield Founder
- DevSecOps Analyst & PhD Candidate (Applied Cryptography & FHE)
- Mile2 Forensics Certified
- Builder of OpenClaw/Red Queen autonomous security agent
- Speaker at Ekoparty, DevConnect Argentina, DeFi Security Summit Buenos Aires
- [@Jawy77](https://twitter.com/Jawy77)

## License

MIT
