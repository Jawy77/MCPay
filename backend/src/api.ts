import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { ethers } from 'ethers';
import axios from 'axios';
import { wrapAxiosWithPayment, x402Client, decodePaymentResponseHeader } from '@x402/axios';
import { ExactEvmScheme, toClientEvmSigner } from '@x402/evm';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http as viemHttp } from 'viem';
import { baseSepolia } from 'viem/chains';
import { config } from 'dotenv';

config();

// ============================================================================
// CONFIG
// ============================================================================

const PORT = parseInt(process.env.PORT || '4000');
const BASE_SEPOLIA_RPC = process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org';
const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY || '';
const MCP_WALLET_ADDRESS = process.env.MCP_WALLET_ADDRESS || '0x0000000000000000000000000000000000000000';
const SHIELD_VAULT_ADDRESS = process.env.SHIELD_VAULT_ADDRESS || '0x0000000000000000000000000000000000000000';
const CORS_ORIGIN = (process.env.CORS_ORIGIN || 'https://mcpay.vercel.app,http://localhost:3000').split(',');
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3001';
const MOCK_PAYMENTS = process.env.MOCK_PAYMENTS !== 'false'; // true by default for dev

// USDC on Base Sepolia
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const ERC20_ABI = ['function balanceOf(address) view returns (uint256)'];

// ShieldVault ABI (relevant functions)
const SHIELD_VAULT_ABI = [
  'function checkPolicy(address _agent, uint256 _amount) view returns (bool allowed, string reason)',
  'function attestationCount() view returns (uint256)',
  'function attestations(uint256) view returns (bytes32 paymentHash, bytes32 serviceHash, uint8 qualityScore, address mcpServer, address agent, uint256 amountPaid, uint256 timestamp, bool disputed)',
  'function getAgentAttestationCount(address _agent) view returns (uint256)',
  'function getLatestAttestation(address _agent) view returns (tuple(bytes32 paymentHash, bytes32 serviceHash, uint8 qualityScore, address mcpServer, address agent, uint256 amountPaid, uint256 timestamp, bool disputed))',
  'function getMcpReputation(address _mcpServer) view returns (uint256 avgScore, uint256 totalCalls, uint256 disputes)',
  'function attest(bytes32 _paymentHash, bytes32 _serviceHash, uint8 _qualityScore, address _mcpServer, address _agent, uint256 _amountPaid)',
];

// ============================================================================
// PROVIDERS
// ============================================================================

const provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);
const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
const vault = new ethers.Contract(SHIELD_VAULT_ADDRESS, SHIELD_VAULT_ABI, provider);

// x402 payment client (only if we have a private key)
let mcpApi: ReturnType<typeof wrapAxiosWithPayment> | null = null;
let agentAddress = '0x0000000000000000000000000000000000000000';

if (AGENT_PRIVATE_KEY && AGENT_PRIVATE_KEY !== '') {
  const account = privateKeyToAccount(AGENT_PRIVATE_KEY as `0x${string}`);
  agentAddress = account.address;

  const viemPublicClient = createPublicClient({
    chain: baseSepolia,
    transport: viemHttp(BASE_SEPOLIA_RPC),
  });

  const evmSigner = toClientEvmSigner(account, viemPublicClient as any);
  const paymentClient = new x402Client().register('eip155:84532', new ExactEvmScheme(evmSigner));

  mcpApi = wrapAxiosWithPayment(
    axios.create({ baseURL: MCP_SERVER_URL, timeout: 60_000 }),
    paymentClient,
  );
}

// ============================================================================
// MCP STORE — Premium tools available
// ============================================================================

const MCP_STORE = [
  {
    id: 'scan-contract',
    name: 'Smart Contract Scanner',
    description: 'Full vulnerability scan: bytecode analysis + pattern matching + risk scoring',
    price: '0.001',
    priceDisplay: '$0.001 USDC',
    network: 'base-sepolia',
    category: 'security',
    provider: 'ShieldPay MCP',
  },
  {
    id: 'check-address',
    name: 'Address Reputation',
    description: 'Wallet/contract reputation check against threat intelligence databases',
    price: '0.001',
    priceDisplay: '$0.001 USDC',
    network: 'base-sepolia',
    category: 'intelligence',
    provider: 'ShieldPay MCP',
  },
  {
    id: 'threat-lookup',
    name: 'Threat Intel Lookup',
    description: 'Query AlienVault OTX, Etherscan labels, and ChainAbuse databases',
    price: '0.001',
    priceDisplay: '$0.001 USDC',
    network: 'base-sepolia',
    category: 'intelligence',
    provider: 'ShieldPay MCP',
  },
];

// ============================================================================
// EXPRESS + WEBSOCKET SERVER
// ============================================================================

const app = express();
app.use(express.json());
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/flow' });

// Track WebSocket clients
const wsClients = new Set<WebSocket>();
wss.on('connection', (ws) => {
  wsClients.add(ws);
  ws.on('close', () => wsClients.delete(ws));
});

function broadcast(event: { step: string; status: string; detail: string; data?: any }) {
  const msg = JSON.stringify(event);
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

// ============================================================================
// ROUTES
// ============================================================================

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'mcpay-backend',
    mock: MOCK_PAYMENTS,
    agentWallet: agentAddress,
    mcpServer: MCP_SERVER_URL,
    network: 'base-sepolia',
    vaultAddress: SHIELD_VAULT_ADDRESS,
    timestamp: new Date().toISOString(),
  });
});

// MCP Store — list premium tools
app.get('/api/store', (_req, res) => {
  res.json({ tools: MCP_STORE });
});

// Wallet balance — USDC + ETH on Base Sepolia
app.get('/api/wallet/:address', async (req, res) => {
  const { address } = req.params;

  try {
    if (MOCK_PAYMENTS) {
      return res.json({
        address,
        eth: '0.5',
        usdc: '100.00',
        network: 'base-sepolia',
        mock: true,
      });
    }

    const [ethBalance, usdcBalance] = await Promise.all([
      provider.getBalance(address),
      usdc.balanceOf(address),
    ]);

    res.json({
      address,
      eth: ethers.formatEther(ethBalance),
      usdc: ethers.formatUnits(usdcBalance, 6),
      network: 'base-sepolia',
      mock: false,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Attestation history for an agent
app.get('/api/attestations/:address', async (req, res) => {
  const { address } = req.params;

  try {
    if (MOCK_PAYMENTS) {
      return res.json({
        address,
        count: 3,
        attestations: [
          { id: 0, tool: 'scan-contract', qualityScore: 85, amount: '0.001', timestamp: new Date(Date.now() - 3600000).toISOString(), disputed: false },
          { id: 1, tool: 'check-address', qualityScore: 90, amount: '0.001', timestamp: new Date(Date.now() - 7200000).toISOString(), disputed: false },
          { id: 2, tool: 'threat-lookup', qualityScore: 70, amount: '0.001', timestamp: new Date(Date.now() - 10800000).toISOString(), disputed: false },
        ],
        mock: true,
      });
    }

    const count = await vault.getAgentAttestationCount(address);
    const countNum = Number(count);

    // Get last 10 attestations
    const attestations = [];
    const totalCount = Number(await vault.attestationCount());

    for (let i = Math.max(0, totalCount - 10); i < totalCount; i++) {
      const a = await vault.attestations(i);
      if (a.agent.toLowerCase() === address.toLowerCase()) {
        attestations.push({
          id: i,
          paymentHash: a.paymentHash,
          serviceHash: a.serviceHash,
          qualityScore: Number(a.qualityScore),
          mcpServer: a.mcpServer,
          agent: a.agent,
          amount: ethers.formatUnits(a.amountPaid, 6),
          timestamp: new Date(Number(a.timestamp) * 1000).toISOString(),
          disputed: a.disputed,
        });
      }
    }

    res.json({ address, count: countNum, attestations, mock: false });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// POST /api/buy — THE MAIN FLOW: pre-flight → x402 pay → MCP call → validate → attest
// ============================================================================

app.post('/api/buy', async (req, res) => {
  const { tool, args, agentAddress: reqAgent } = req.body;
  const agent = reqAgent || agentAddress;

  if (!tool || !args) {
    return res.status(400).json({ error: 'Missing tool or args' });
  }

  const toolInfo = MCP_STORE.find(t => t.id === tool);
  if (!toolInfo) {
    return res.status(400).json({ error: `Unknown tool: ${tool}` });
  }

  const flowId = Date.now().toString(36);
  console.log(`[FLOW ${flowId}] Starting: ${tool} for ${agent}`);

  try {
    // ================================================================
    // STEP 1: PRE-FLIGHT — Check spending policy
    // ================================================================
    broadcast({ step: 'preflight', status: 'running', detail: 'Checking spending policy on ShieldVault...' });

    let policyAllowed = true;
    let policyReason = 'no policy set';

    if (!MOCK_PAYMENTS) {
      try {
        const [allowed, reason] = await vault.checkPolicy(agent, ethers.parseUnits(toolInfo.price, 6));
        policyAllowed = allowed;
        policyReason = reason;
      } catch {
        policyReason = 'vault not deployed — skipping policy check';
      }
    }

    broadcast({
      step: 'preflight',
      status: policyAllowed ? 'done' : 'error',
      detail: policyAllowed ? `Policy OK: ${policyReason}` : `Blocked: ${policyReason}`,
      data: { allowed: policyAllowed, reason: policyReason },
    });

    if (!policyAllowed) {
      return res.status(403).json({ error: `Policy blocked: ${policyReason}` });
    }

    // ================================================================
    // STEP 2: x402 PAYMENT — Call MCP with auto-pay
    // ================================================================
    broadcast({ step: 'payment', status: 'running', detail: `Signing ${toolInfo.priceDisplay} payment on Base Sepolia...` });

    let mcpResult: any;
    let txHash: string | null = null;

    if (MOCK_PAYMENTS) {
      // Simulate payment delay
      await new Promise(r => setTimeout(r, 800));
      txHash = `0x${Buffer.from(`mock-tx-${flowId}`).toString('hex').padEnd(64, '0')}`;

      broadcast({
        step: 'payment',
        status: 'done',
        detail: `Mock payment settled: ${txHash.slice(0, 18)}...`,
        data: { txHash, amount: toolInfo.price, mock: true },
      });

      // Call MCP directly (no x402)
      broadcast({ step: 'mcp-call', status: 'running', detail: `Calling ${tool} on MCP server...` });

      const mcpRes = await axios.post(`${MCP_SERVER_URL}/mcp`, {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: tool, arguments: args },
        id: Date.now(),
      });
      mcpResult = mcpRes.data;
    } else {
      if (!mcpApi) {
        return res.status(500).json({ error: 'AGENT_PRIVATE_KEY not configured' });
      }

      const mcpRes = await mcpApi.post('/mcp', {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: tool, arguments: args },
        id: Date.now(),
      });

      // Extract txHash from x402 payment header
      const paymentHeader = mcpRes.headers['x-payment-response'];
      if (paymentHeader) {
        try {
          const decoded = decodePaymentResponseHeader(paymentHeader);
          txHash = (decoded as any)?.txHash ?? (decoded as any)?.transaction ?? paymentHeader;
        } catch {
          txHash = paymentHeader;
        }
      }

      broadcast({
        step: 'payment',
        status: 'done',
        detail: `Payment settled: ${txHash?.slice(0, 18) ?? 'confirmed'}...`,
        data: { txHash, amount: toolInfo.price },
      });

      broadcast({ step: 'mcp-call', status: 'running', detail: `Calling ${tool} on MCP server...` });
      mcpResult = mcpRes.data;
    }

    // Parse MCP content
    const contentText = mcpResult?.result?.content?.[0]?.text || '';
    let parsedContent: any;
    try { parsedContent = JSON.parse(contentText); }
    catch { parsedContent = { raw: contentText }; }

    broadcast({
      step: 'mcp-call',
      status: 'done',
      detail: `MCP responded with ${contentText.length} bytes`,
      data: { preview: contentText.slice(0, 200) },
    });

    // ================================================================
    // STEP 3: QUALITY VALIDATION
    // ================================================================
    broadcast({ step: 'validate', status: 'running', detail: 'Validating service quality...' });

    let qualityScore = 0;

    // Schema check: valid MCP structure
    if (mcpResult?.result?.content && Array.isArray(mcpResult.result.content)) {
      qualityScore += 30;
    }

    // Content check: non-trivial response
    if (contentText.length > 10) qualityScore += 30;
    if (contentText.length > 100) qualityScore += 20;

    // Status check: valid JSON-RPC response
    if (mcpResult?.jsonrpc === '2.0' && !mcpResult?.error) {
      qualityScore += 20;
    }

    qualityScore = Math.min(qualityScore, 100);

    const serviceHash = ethers.keccak256(ethers.toUtf8Bytes(contentText));
    const paymentHash = ethers.keccak256(ethers.toUtf8Bytes(txHash || `mock-${flowId}`));

    broadcast({
      step: 'validate',
      status: 'done',
      detail: `Quality score: ${qualityScore}/100`,
      data: { qualityScore, serviceHash: serviceHash.slice(0, 18), paymentHash: paymentHash.slice(0, 18) },
    });

    // ================================================================
    // STEP 4: ON-CHAIN ATTESTATION
    // ================================================================
    broadcast({ step: 'attest', status: 'running', detail: 'Writing attestation to ShieldVault.sol...' });

    let attestTx: string | null = null;

    if (MOCK_PAYMENTS) {
      await new Promise(r => setTimeout(r, 500));
      attestTx = `0x${Buffer.from(`mock-attest-${flowId}`).toString('hex').padEnd(64, '0')}`;

      broadcast({
        step: 'attest',
        status: 'done',
        detail: `Mock attestation: ${attestTx.slice(0, 18)}...`,
        data: { attestTx, mock: true },
      });
    } else {
      try {
        const wallet = new ethers.Wallet(AGENT_PRIVATE_KEY, provider);
        const vaultWrite = new ethers.Contract(SHIELD_VAULT_ADDRESS, SHIELD_VAULT_ABI, wallet);

        const tx = await vaultWrite.attest(
          paymentHash,
          serviceHash,
          qualityScore,
          MCP_WALLET_ADDRESS,
          agent,
          ethers.parseUnits(toolInfo.price, 6),
        );
        await tx.wait();
        attestTx = tx.hash;

        broadcast({
          step: 'attest',
          status: 'done',
          detail: `Attestation TX: ${attestTx!.slice(0, 18)}...`,
          data: { attestTx },
        });
      } catch (e: any) {
        broadcast({
          step: 'attest',
          status: 'error',
          detail: `Attestation failed: ${e.message.slice(0, 100)}`,
        });
      }
    }

    // ================================================================
    // DONE
    // ================================================================
    broadcast({
      step: 'complete',
      status: 'done',
      detail: `Flow complete. Quality: ${qualityScore}/100`,
      data: { flowId, tool, qualityScore, txHash, attestTx },
    });

    console.log(`[FLOW ${flowId}] Complete. Quality: ${qualityScore} | Payment: ${txHash?.slice(0, 18)} | Attest: ${attestTx?.slice(0, 18)}`);

    res.json({
      success: true,
      flowId,
      tool,
      qualityScore,
      paymentTx: txHash,
      attestationTx: attestTx,
      serviceHash,
      paymentHash,
      mcpResult: parsedContent,
      mock: MOCK_PAYMENTS,
    });

  } catch (e: any) {
    console.error(`[FLOW ${flowId}] Error:`, e.message);
    broadcast({ step: 'error', status: 'error', detail: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// START
// ============================================================================

server.listen(PORT, () => {
  console.log(`\n  MCPay Backend API`);
  console.log(`   Port: ${PORT}`);
  console.log(`   Mode: ${MOCK_PAYMENTS ? 'MOCK (local dev)' : 'LIVE (Base Sepolia)'}`);
  console.log(`   CORS: ${CORS_ORIGIN.join(', ')}`);
  console.log(`   Agent: ${agentAddress}`);
  console.log(`   MCP:   ${MCP_SERVER_URL}`);
  console.log(`   Vault: ${SHIELD_VAULT_ADDRESS}`);
  console.log(`   WS:    ws://localhost:${PORT}/ws/flow`);
  console.log(`   API:   http://localhost:${PORT}/api/health\n`);
});
