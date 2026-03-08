import express from 'express';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { randomBytes, createHash } from 'crypto';

const app = express();
app.use(express.json());

const PORT = process.env.MCP_PORT || 3001;
const PAYEE_ADDRESS = process.env.PAYEE_WALLET_ADDRESS || '0x0000000000000000000000000000000000000000';
const FACILITATOR_URL = process.env.FACILITATOR_URL || 'https://x402.org/facilitator';
const MOCK_PAYMENTS = process.env.MOCK_PAYMENTS !== 'false'; // true by default for dev

// ============================================================================
// x402 PAYMENT MIDDLEWARE — Base Sepolia USDC (skipped in mock mode)
// ============================================================================

if (!MOCK_PAYMENTS) {
  const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
  const resourceServer = new x402ResourceServer(facilitatorClient)
    .register('eip155:84532', new ExactEvmScheme());

  app.use(
    paymentMiddleware(
      {
        'POST /mcp': {
          accepts: {
            scheme: 'exact',
            price: '$0.001',
            network: 'eip155:84532',      // Base Sepolia
            payTo: PAYEE_ADDRESS,
            maxTimeoutSeconds: 120,
          },
          description: 'Premium smart contract security scan via ShieldPay MCP',
        },
      },
      resourceServer,
    ),
  );
} else {
  console.log('  MOCK_PAYMENTS=true — x402 payment gate DISABLED for dev');
}

// ============================================================================
// SIMULATED SECURITY SCAN RESULTS
// ============================================================================

interface VulnResult {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  title: string;
  description: string;
  location: string;
}

function generateScanResults(address: string): VulnResult[] {
  const seed = createHash('md5').update(address).digest('hex');
  const vulnCount = (parseInt(seed.slice(0, 2), 16) % 5) + 1;

  const vulnTemplates: VulnResult[] = [
    { severity: 'CRITICAL', title: 'Reentrancy in withdraw()', description: 'External call before state update allows recursive withdrawal', location: 'Line 142: withdraw() -> msg.sender.call{value: amount}("")' },
    { severity: 'HIGH', title: 'Unchecked delegatecall', description: 'delegatecall to user-supplied address without validation', location: 'Line 89: (bool success,) = target.delegatecall(data)' },
    { severity: 'HIGH', title: 'Missing access control on mint()', description: 'No onlyOwner or role check on token minting function', location: 'Line 56: function mint(address to, uint256 amount) public' },
    { severity: 'MEDIUM', title: 'Block.timestamp dependency', description: 'Uses block.timestamp for time-sensitive logic, manipulable by miners', location: 'Line 201: require(block.timestamp > deadline)' },
    { severity: 'MEDIUM', title: 'Integer overflow in reward calculation', description: 'Multiplication before division may overflow for large values', location: 'Line 178: reward = balance * rate * duration' },
    { severity: 'LOW', title: 'Missing zero-address check', description: 'Constructor does not validate that _owner is not address(0)', location: 'Line 23: constructor(address _owner)' },
    { severity: 'LOW', title: 'Floating pragma', description: 'Contract uses ^0.8.0 instead of fixed version', location: 'Line 1: pragma solidity ^0.8.0' },
    { severity: 'INFO', title: 'Gas optimization opportunity', description: 'Multiple storage reads in loop can be cached in memory', location: 'Line 156-170: for loop reading balances[i]' },
  ];

  return vulnTemplates.slice(0, vulnCount);
}

function calculateRiskScore(vulns: VulnResult[]): number {
  let score = 0;
  for (const v of vulns) {
    if (v.severity === 'CRITICAL') score += 30;
    else if (v.severity === 'HIGH') score += 20;
    else if (v.severity === 'MEDIUM') score += 10;
    else if (v.severity === 'LOW') score += 5;
    else score += 1;
  }
  return Math.min(score, 100);
}

// ============================================================================
// MCP TOOL LIST (for discovery)
// ============================================================================

const MCP_TOOLS = [
  {
    name: 'scan-contract',
    description: 'Full vulnerability scan of a smart contract: bytecode analysis + pattern matching + risk scoring',
    price: '0.001 USDC',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Contract address to scan (0x...)' },
        chain: { type: 'string', description: 'Chain name (base, ethereum, polygon)', default: 'base' },
      },
      required: ['address'],
    },
  },
  {
    name: 'check-address',
    description: 'Quick reputation check for a wallet or contract address',
    price: '0.001 USDC',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Address to check (0x...)' },
      },
      required: ['address'],
    },
  },
  {
    name: 'threat-lookup',
    description: 'Query threat intelligence databases for known malicious indicators',
    price: '0.001 USDC',
    inputSchema: {
      type: 'object',
      properties: {
        indicator: { type: 'string', description: 'Address, domain, or hash to look up' },
      },
      required: ['indicator'],
    },
  },
];

// ============================================================================
// MCP ENDPOINTS
// ============================================================================

// Tool discovery (free — no payment required)
app.get('/mcp', (_req, res) => {
  res.json({
    jsonrpc: '2.0',
    result: {
      name: 'ShieldPay Security MCP',
      version: '0.1.0',
      description: 'Premium smart contract security analysis. x402-gated on Base Sepolia. Powered by ShieldPay + Chainlink CRE.',
      tools: MCP_TOOLS,
    },
  });
});

// Tool execution (x402-gated — requires USDC payment)
app.post('/mcp', (req, res) => {
  const { method, params, id } = req.body;

  console.log(`[MCP] PAID request — ${method} called with:`, JSON.stringify(params).slice(0, 200));

  if (method === 'tools/list') {
    return res.json({ jsonrpc: '2.0', id, result: { tools: MCP_TOOLS } });
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const args = params?.arguments || {};

    // Set X-MCPay-Price header so backend/agents know the tool cost
    const toolMeta = MCP_TOOLS.find(t => t.name === toolName);
    if (toolMeta) {
      res.setHeader('X-MCPay-Price', toolMeta.price);
    }

    // ---- scan-contract ----
    if (toolName === 'scan-contract') {
      const address = args.address || '0x0000000000000000000000000000000000000000';
      const chain = args.chain || 'base';

      console.log(`[MCP] Scanning contract ${address} on ${chain}...`);

      const vulns = generateScanResults(address);
      const riskScore = calculateRiskScore(vulns);

      const report = {
        contract: address,
        chain,
        scanId: randomBytes(16).toString('hex'),
        timestamp: new Date().toISOString(),
        riskScore,
        riskLevel: riskScore >= 50 ? 'HIGH' : riskScore >= 20 ? 'MEDIUM' : 'LOW',
        vulnerabilities: vulns,
        summary: `Found ${vulns.length} vulnerabilities (${vulns.filter(v => v.severity === 'CRITICAL').length} critical, ${vulns.filter(v => v.severity === 'HIGH').length} high). Risk score: ${riskScore}/100.`,
        analyzers: ['bytecode-patterns', 'slither-rules', 'semgrep-solidity'],
      };

      return res.json({
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }] },
      });
    }

    // ---- check-address ----
    if (toolName === 'check-address') {
      const address = args.address || '0x0';
      const hash = createHash('md5').update(address).digest('hex');
      const isSuspicious = parseInt(hash.slice(0, 2), 16) > 200;

      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{
            type: 'text',
            text: JSON.stringify({
              address,
              reputation: isSuspicious ? 'SUSPICIOUS' : 'CLEAN',
              flags: isSuspicious ? ['known-drainer-pattern', 'linked-to-tornado-cash'] : [],
              firstSeen: '2024-03-15',
              txCount: parseInt(hash.slice(2, 6), 16),
              labels: isSuspicious ? ['drainer', 'mixer-user'] : ['verified-contract'],
            }, null, 2),
          }],
        },
      });
    }

    // ---- threat-lookup ----
    if (toolName === 'threat-lookup') {
      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{
            type: 'text',
            text: JSON.stringify({
              indicator: args.indicator,
              found: false,
              sources: ['alientvault-otx', 'etherscan-labels', 'chainabuse'],
              message: 'No threats found in intelligence databases.',
            }, null, 2),
          }],
        },
      });
    }

    return res.status(400).json({
      jsonrpc: '2.0', id,
      error: { code: -32601, message: `Unknown tool: ${toolName}` },
    });
  }

  res.status(400).json({
    jsonrpc: '2.0', id,
    error: { code: -32601, message: `Unknown method: ${method}` },
  });
});

// Health check (free)
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'shieldpay-demo-mcp',
    x402: true,
    payee: PAYEE_ADDRESS,
    network: 'base-sepolia',
    facilitator: FACILITATOR_URL,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// START
// ============================================================================

app.listen(PORT, () => {
  console.log(`\n  ShieldPay Demo MCP Server`);
  console.log(`   Port: ${PORT}`);
  console.log(`   Mode: ${MOCK_PAYMENTS ? 'MOCK (no x402 gate)' : 'LIVE (x402 USDC)'}`);
  console.log(`   Payee: ${PAYEE_ADDRESS}`);
  console.log(`   Facilitator: ${FACILITATOR_URL}`);
  console.log(`   Tools: scan-contract, check-address, threat-lookup`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   MCP:    http://localhost:${PORT}/mcp\n`);
});
