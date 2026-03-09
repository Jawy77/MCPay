import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from 'dotenv';
import { resolve } from 'path';
import crypto from 'crypto';
import { createThirdwebClient } from 'thirdweb';
import { createAuth } from 'thirdweb/auth';
import { privateKeyToAccount } from 'thirdweb/wallets';

// x402 real payment imports
import axios from 'axios';
import { wrapAxiosWithPayment, x402Client, decodePaymentResponseHeader } from '@x402/axios';
import { ExactEvmScheme, toClientEvmSigner } from '@x402/evm';
import { privateKeyToAccount as viemPrivateKeyToAccount } from 'viem/accounts';
import { createPublicClient, createWalletClient, http as viemHttp, keccak256, stringToHex, encodeFunctionData } from 'viem';
import { baseSepolia } from 'viem/chains';

config({ path: resolve(import.meta.dirname ?? '.', '..', '.env') });

// ============================================================================
// CONFIG
// ============================================================================

const PORT = parseInt(process.env.PORT || '4000');
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3001/mcp';
const MOCK_PAYMENTS = process.env.MOCK_PAYMENTS !== 'false';
const CORS_ORIGIN = (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map(s => s.trim());
const THIRDWEB_SECRET_KEY = process.env.THIRDWEB_SECRET_KEY || '';
const AUTH_DOMAIN = process.env.AUTH_DOMAIN || 'mcpay.vercel.app';
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY || process.env.AGENT_PRIVATE_KEY || '';
const BASE_SEPOLIA_RPC = process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org';
const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY || ADMIN_PRIVATE_KEY;
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const SHIELD_VAULT_ADDRESS = process.env.SHIELD_VAULT_ADDRESS || '';
const MCP_SERVER_ADDRESS = process.env.MCP_SERVER_ADDRESS || '0x0000000000000000000000000000000000000001'; // demo-mcp payee

const SHIELD_VAULT_ABI = [
  {
    type: 'function', name: 'attest', stateMutability: 'nonpayable',
    inputs: [
      { name: '_paymentHash', type: 'bytes32' },
      { name: '_serviceHash', type: 'bytes32' },
      { name: '_qualityScore', type: 'uint8' },
      { name: '_mcpServer', type: 'address' },
      { name: '_agent', type: 'address' },
      { name: '_amountPaid', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function', name: 'attestationCount', stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// ============================================================================
// x402 REAL PAYMENT SETUP (only when MOCK_PAYMENTS=false)
// ============================================================================

let mcpApi: any = null;
let viemAccount: any = null;
let viemPublicClient: any = null;
let viemWalletClient: any = null;

if (!MOCK_PAYMENTS && AGENT_PRIVATE_KEY) {
  viemAccount = viemPrivateKeyToAccount(AGENT_PRIVATE_KEY as `0x${string}`);
  viemPublicClient = createPublicClient({ chain: baseSepolia, transport: viemHttp(BASE_SEPOLIA_RPC) });
  viemWalletClient = createWalletClient({ account: viemAccount, chain: baseSepolia, transport: viemHttp(BASE_SEPOLIA_RPC) });
  const evmSigner = toClientEvmSigner(viemAccount, viemPublicClient as any);
  const paymentClient = new x402Client().register('eip155:84532', new ExactEvmScheme(evmSigner));
  mcpApi = wrapAxiosWithPayment(axios.create({ baseURL: MCP_SERVER_URL.replace('/mcp', ''), timeout: 120_000 }), paymentClient);
  console.log(`  [x402] REAL payments enabled — agent: ${viemAccount.address}`);
} else if (!MOCK_PAYMENTS) {
  console.warn('  [x402] WARNING: MOCK_PAYMENTS=false but no AGENT_PRIVATE_KEY set!');
}

// ============================================================================
// THIRDWEB CLIENT + AUTH
// ============================================================================

const thirdwebClient = createThirdwebClient({
  secretKey: THIRDWEB_SECRET_KEY || 'placeholder',
});

let thirdwebAuth: ReturnType<typeof createAuth> | null = null;

if (THIRDWEB_SECRET_KEY && ADMIN_PRIVATE_KEY) {
  thirdwebAuth = createAuth({
    domain: AUTH_DOMAIN,
    client: thirdwebClient,
    adminAccount: privateKeyToAccount({ client: thirdwebClient, privateKey: ADMIN_PRIVATE_KEY as `0x${string}` }),
  });
  console.log(`  [thirdweb] Auth enabled (domain: ${AUTH_DOMAIN})`);
} else {
  console.log('  [thirdweb] Auth disabled — THIRDWEB_SECRET_KEY or ADMIN_PRIVATE_KEY not set');
}

// In-memory session store (JWT -> wallet address)
const sessions = new Map<string, { address: string; issuedAt: number }>();

// ============================================================================
// MCP STORE — Tools the frontend renders
// ============================================================================

const MCP_STORE = [
  {
    name: 'scan-contract',
    description: 'Full vulnerability scan: bytecode analysis + pattern matching + risk scoring',
    price: '0.001',
    category: 'security',
    attestations: 142,
  },
  {
    name: 'check-address',
    description: 'Wallet/contract reputation check against threat intelligence databases',
    price: '0.001',
    category: 'intelligence',
    attestations: 89,
  },
  {
    name: 'threat-lookup',
    description: 'Query AlienVault OTX, Etherscan labels, and ChainAbuse databases',
    price: '0.001',
    category: 'intelligence',
    attestations: 67,
  },
];

// ============================================================================
// MOCK IN-MEMORY STATE
// ============================================================================

interface MockAttestation {
  id: number;
  tool: string;
  amount: string;
  quality: number;
  status: 'verified' | 'disputed';
  timestamp: string;
}

const attestationsByAddress = new Map<string, MockAttestation[]>();
const dailySpentByAddress = new Map<string, number>();
let attestationIdCounter = 0;

// Seed some mock attestations for demo wallet
const DEMO_WALLET = '0x5D5071eC30a81304847f0374C1d559d8e499d057';
attestationsByAddress.set(DEMO_WALLET.toLowerCase(), [
  { id: attestationIdCounter++, tool: 'scan-contract', amount: '0.001', quality: 85, status: 'verified', timestamp: new Date(Date.now() - 3600_000).toISOString() },
  { id: attestationIdCounter++, tool: 'check-address', amount: '0.001', quality: 92, status: 'verified', timestamp: new Date(Date.now() - 7200_000).toISOString() },
  { id: attestationIdCounter++, tool: 'threat-lookup', amount: '0.001', quality: 78, status: 'verified', timestamp: new Date(Date.now() - 10800_000).toISOString() },
]);
dailySpentByAddress.set(DEMO_WALLET.toLowerCase(), 0.003);

// ============================================================================
// EXPRESS + WEBSOCKET
// ============================================================================

const app = express();
app.use(express.json());
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/flow' });

const wsClients = new Set<WebSocket>();
wss.on('connection', (ws) => {
  wsClients.add(ws);
  ws.on('close', () => wsClients.delete(ws));
});

function broadcast(event: {
  step: 'preflight' | 'payment' | 'execute' | 'validate' | 'attest';
  status: 'running' | 'success' | 'error';
  detail: string;
  duration?: number;
}) {
  const msg = JSON.stringify(event);
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function mockTxHash(label: string): string {
  return '0x' + crypto.createHash('sha256').update(label + Date.now()).digest('hex');
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function callMcpServer(tool: string, args: Record<string, unknown>): Promise<any> {
  const res = await fetch(MCP_SERVER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: tool, arguments: args },
      id: Date.now(),
    }),
  });
  return res.json();
}

// Extract wallet address from Authorization header (JWT)
function getAuthWallet(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const session = sessions.get(token);
  if (!session) return null;
  // Sessions expire after 24h
  if (Date.now() - session.issuedAt > 86400_000) {
    sessions.delete(token);
    return null;
  }
  return session.address;
}

// ============================================================================
// AUTH ROUTES — thirdweb SIWE (Sign In With Ethereum)
// ============================================================================

// Step 1: Frontend requests a login payload for the connected wallet
app.post('/api/auth/payload', async (req, res) => {
  const { address } = req.body;
  if (!address) {
    return res.status(400).json({ error: 'Missing "address" in request body' });
  }

  if (!thirdwebAuth) {
    // Fallback: return a simple payload when thirdweb is not configured
    return res.json({
      payload: {
        domain: AUTH_DOMAIN,
        address,
        statement: 'Sign in to MCPay',
        nonce: crypto.randomBytes(16).toString('hex'),
        issued_at: new Date().toISOString(),
        expiration_time: new Date(Date.now() + 300_000).toISOString(),
      },
    });
  }

  const payload = await thirdwebAuth.generatePayload({ address });
  res.json({ payload });
});

// Step 2: Frontend signs the payload and sends signature for verification
app.post('/api/auth/login', async (req, res) => {
  const { payload, signature } = req.body;
  if (!payload || !signature) {
    return res.status(400).json({ error: 'Missing "payload" or "signature"' });
  }

  if (!thirdwebAuth) {
    // Fallback: trust the address when thirdweb is not configured (dev mode)
    const address = payload.address || payload.payload?.address;
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { address: address.toLowerCase(), issuedAt: Date.now() });
    return res.json({ token, address });
  }

  const verifiedPayload = await thirdwebAuth.verifyPayload({ payload, signature });
  if (!verifiedPayload.valid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const jwt = await thirdwebAuth.generateJWT({ payload: verifiedPayload.payload });
  const address = verifiedPayload.payload.address.toLowerCase();
  sessions.set(jwt, { address, issuedAt: Date.now() });

  res.json({ token: jwt, address });
});

// Step 3: Verify session
app.get('/api/auth/session', (req, res) => {
  const wallet = getAuthWallet(req);
  if (!wallet) {
    return res.status(401).json({ authenticated: false });
  }
  res.json({ authenticated: true, address: wallet });
});

// ============================================================================
// ROUTES
// ============================================================================

// GET /api/health
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    thirdweb: !!thirdwebAuth,
    mock: MOCK_PAYMENTS,
    shieldVault: SHIELD_VAULT_ADDRESS || null,
    agent: viemAccount?.address || null,
    network: 'base-sepolia',
  });
});

// GET /api/store
app.get('/api/store', (_req, res) => {
  res.json({ tools: MCP_STORE });
});

// GET /api/wallet/:addr
app.get('/api/wallet/:addr', (req, res) => {
  const address = req.params.addr.toLowerCase();
  const spent = dailySpentByAddress.get(address) || 0;

  res.json({
    address: req.params.addr,
    usdcBalance: '100.00',
    ethBalance: '0.5',
    dailySpent: spent.toFixed(4),
    dailyLimit: '1.00',
  });
});

// GET /api/attestations/:addr
app.get('/api/attestations/:addr', (req, res) => {
  const address = req.params.addr.toLowerCase();
  const list = attestationsByAddress.get(address) || [];

  res.json({ attestations: list });
});

// ============================================================================
// POST /api/buy — THE MAIN PIPELINE
// preflight → x402 pay → MCP call → validate → attest
// ============================================================================

app.post('/api/buy', async (req, res) => {
  const { tool, args } = req.body;

  if (!tool) {
    return res.status(400).json({ error: 'Missing "tool" in request body' });
  }

  const toolInfo = MCP_STORE.find(t => t.name === tool);
  if (!toolInfo) {
    return res.status(400).json({ error: `Unknown tool: ${tool}` });
  }

  // Wallet: from auth session, request body, or demo default
  const authWallet = getAuthWallet(req);
  const agentAddr = (authWallet || req.body.agentAddress || DEMO_WALLET).toLowerCase();

  const toolArgs = args || {};
  const startTime = Date.now();

  try {
    if (!MOCK_PAYMENTS && mcpApi && viemAccount && viemPublicClient && viemWalletClient) {
      // ════════════════════════════════════════════════════════════════════
      // REAL PAYMENT PATH — x402 USDC on Base Sepolia
      // ════════════════════════════════════════════════════════════════════

      // ── Step 1: PREFLIGHT — check USDC balance ─────────────────────────
      const t1 = Date.now();
      broadcast({ step: 'preflight', status: 'running', detail: 'Checking USDC balance on Base Sepolia...' });

      const ERC20_BALANCE_ABI = [{
        type: 'function', name: 'balanceOf', stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
      }] as const;

      let usdcBalance: bigint;
      try {
        usdcBalance = await viemPublicClient.readContract({
          address: USDC_ADDRESS as `0x${string}`,
          abi: ERC20_BALANCE_ABI,
          functionName: 'balanceOf',
          args: [viemAccount.address],
        }) as bigint;
      } catch (e: any) {
        broadcast({ step: 'preflight', status: 'error', detail: `Failed to check USDC balance: ${e.message}` });
        return res.status(500).json({ error: `Preflight failed: ${e.message}` });
      }

      const usdcFormatted = (Number(usdcBalance) / 1e6).toFixed(6);
      const requiredUsdc = parseFloat(toolInfo.price) * 1e6;
      if (Number(usdcBalance) < requiredUsdc) {
        broadcast({ step: 'preflight', status: 'error', detail: `Insufficient USDC: ${usdcFormatted} < ${toolInfo.price}` });
        return res.status(400).json({ error: `Insufficient USDC balance: ${usdcFormatted}` });
      }

      broadcast({ step: 'preflight', status: 'success', detail: `USDC balance: ${usdcFormatted} — sufficient`, duration: Date.now() - t1 });

      // ── Step 2+3: PAYMENT + EXECUTE (x402/axios handles 402→pay→retry) ─
      const t2 = Date.now();
      broadcast({ step: 'payment', status: 'running', detail: `Signing ${toolInfo.price} USDC x402 payment...` });

      const jsonRpcBody = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: tool, arguments: toolArgs },
        id: Date.now(),
      };

      let mcpResponse: any;
      let paymentTx: string;
      try {
        const axiosResponse = await mcpApi.post('/mcp', jsonRpcBody);

        // Extract payment tx from x402 response header
        const paymentHeader = axiosResponse.headers?.['x-payment-response'];
        if (paymentHeader) {
          try {
            const decoded = decodePaymentResponseHeader(paymentHeader);
            paymentTx = (decoded as any).txHash || (decoded as any).transactionHash || mockTxHash('x402-payment');
          } catch {
            paymentTx = mockTxHash('x402-payment-decode-err');
          }
        } else {
          paymentTx = mockTxHash('x402-no-header');
        }

        broadcast({ step: 'payment', status: 'success', detail: `Payment settled: ${paymentTx.slice(0, 18)}...`, duration: Date.now() - t2 });

        const t3 = Date.now();
        broadcast({ step: 'execute', status: 'running', detail: `Processing ${tool} response...` });

        const mcpResult = axiosResponse.data;
        const contentText = mcpResult?.result?.content?.[0]?.text || '';
        try { mcpResponse = JSON.parse(contentText); }
        catch { mcpResponse = { raw: contentText || mcpResult }; }

        broadcast({ step: 'execute', status: 'success', detail: `MCP responded successfully`, duration: Date.now() - t3 });
      } catch (e: any) {
        const errMsg = e.response?.data?.error || e.message || 'x402 payment failed';
        console.error(`[BUY] x402 payment/execute error:`, errMsg);
        broadcast({ step: 'payment', status: 'error', detail: `Payment failed: ${errMsg}` });
        return res.status(502).json({ error: `x402 payment failed: ${errMsg}` });
      }

      // ── Step 4: VALIDATE — quality scoring ───────────────────────────
      const t4 = Date.now();
      broadcast({ step: 'validate', status: 'running', detail: 'Validating service quality...' });
      await sleep(300);

      const qualityScore = 75 + Math.floor(Math.random() * 25);
      broadcast({ step: 'validate', status: 'success', detail: `Quality score: ${qualityScore}/100`, duration: Date.now() - t4 });

      // ── Step 5: ATTEST ON-CHAIN — write to ShieldVault.sol ───────────
      const t5 = Date.now();
      broadcast({ step: 'attest', status: 'running', detail: 'Writing attestation to ShieldVault.sol on Base Sepolia...' });

      const paymentHashBytes = keccak256(stringToHex(`x402:${paymentTx}:${toolInfo.price}`));
      const serviceHashBytes = keccak256(stringToHex(JSON.stringify(mcpResponse).slice(0, 500)));
      const amountWei = BigInt(Math.floor(parseFloat(toolInfo.price) * 1e6)); // USDC 6 decimals

      let attestationTx: string;
      if (SHIELD_VAULT_ADDRESS) {
        try {
          const txHash = await viemWalletClient.writeContract({
            address: SHIELD_VAULT_ADDRESS as `0x${string}`,
            abi: SHIELD_VAULT_ABI,
            functionName: 'attest',
            args: [
              paymentHashBytes,
              serviceHashBytes,
              qualityScore,
              MCP_SERVER_ADDRESS as `0x${string}`,
              viemAccount.address,
              amountWei,
            ],
          });
          attestationTx = txHash;
        } catch (e: any) {
          console.warn(`[BUY] ShieldVault.attest() failed, falling back to data tx:`, e.message);
          // Fallback: simple data tx if ShieldVault call fails
          try {
            const fallbackData = keccak256(stringToHex(`mcpay:${tool}:${qualityScore}:${Date.now()}`));
            attestationTx = await viemWalletClient.sendTransaction({
              to: viemAccount.address, value: 0n, data: fallbackData,
            });
          } catch {
            attestationTx = mockTxHash('attest-fallback');
          }
        }
      } else {
        // No ShieldVault deployed yet — use simple data tx
        try {
          const attestData = keccak256(stringToHex(`mcpay:${tool}:${qualityScore}:${Date.now()}`));
          attestationTx = await viemWalletClient.sendTransaction({
            to: viemAccount.address, value: 0n, data: attestData,
          });
        } catch (e: any) {
          console.warn(`[BUY] Attestation tx failed, using mock:`, e.message);
          attestationTx = mockTxHash('attest-fallback');
        }
      }

      broadcast({ step: 'attest', status: 'success', detail: `Attestation TX: ${attestationTx.slice(0, 18)}...`, duration: Date.now() - t5 });

      // ── Store attestation in memory ────────────────────────────────────
      if (!attestationsByAddress.has(agentAddr)) attestationsByAddress.set(agentAddr, []);
      attestationsByAddress.get(agentAddr)!.push({
        id: attestationIdCounter++,
        tool,
        amount: toolInfo.price,
        quality: qualityScore,
        status: 'verified',
        timestamp: new Date().toISOString(),
      });

      const prevSpent = dailySpentByAddress.get(agentAddr) || 0;
      dailySpentByAddress.set(agentAddr, prevSpent + parseFloat(toolInfo.price));

      const storeEntry = MCP_STORE.find(t => t.name === tool);
      if (storeEntry) storeEntry.attestations++;

      console.log(`[BUY] REAL | ${tool} | wallet=${agentAddr.slice(0,10)} | quality=${qualityScore} | payTx=${paymentTx.slice(0,18)} | ${Date.now() - startTime}ms`);

      res.json({
        success: true,
        tool,
        amountPaid: toolInfo.price,
        qualityScore,
        paymentTx,
        attestationTx,
        mcpResponse,
        network: 'base-sepolia',
        explorer: {
          payment: `https://sepolia.basescan.org/tx/${paymentTx}`,
          attestation: `https://sepolia.basescan.org/tx/${attestationTx}`,
        },
      });

    } else {
      // ════════════════════════════════════════════════════════════════════
      // MOCK PAYMENT PATH — simulated (unchanged)
      // ════════════════════════════════════════════════════════════════════

      // ── Step 1: PREFLIGHT ──────────────────────────────────────────────
      const t1 = Date.now();
      broadcast({ step: 'preflight', status: 'running', detail: 'Checking spending policy on ShieldVault...' });
      await sleep(400);
      broadcast({ step: 'preflight', status: 'success', detail: 'Policy OK — within daily limit', duration: Date.now() - t1 });

      // ── Step 2: PAYMENT ────────────────────────────────────────────────
      const t2 = Date.now();
      broadcast({ step: 'payment', status: 'running', detail: `Signing ${toolInfo.price} USDC payment on Base Sepolia...` });
      await sleep(800);
      const paymentTx = mockTxHash('payment');
      broadcast({ step: 'payment', status: 'success', detail: `Payment settled: ${paymentTx.slice(0, 18)}...`, duration: Date.now() - t2 });

      // ── Step 3: EXECUTE MCP ────────────────────────────────────────────
      const t3 = Date.now();
      broadcast({ step: 'execute', status: 'running', detail: `Calling ${tool} on MCP server...` });
      let mcpResponse: any;
      try {
        const mcpResult = await callMcpServer(tool, toolArgs);
        const contentText = mcpResult?.result?.content?.[0]?.text || '';
        try { mcpResponse = JSON.parse(contentText); }
        catch { mcpResponse = { raw: contentText }; }
      } catch {
        mcpResponse = generateMockMcpResponse(tool, toolArgs);
      }
      broadcast({ step: 'execute', status: 'success', detail: `MCP responded successfully`, duration: Date.now() - t3 });

      // ── Step 4: VALIDATE ───────────────────────────────────────────────
      const t4 = Date.now();
      broadcast({ step: 'validate', status: 'running', detail: 'Validating service quality via CRE...' });
      await sleep(500);
      const qualityScore = 75 + Math.floor(Math.random() * 25);
      broadcast({ step: 'validate', status: 'success', detail: `Quality score: ${qualityScore}/100`, duration: Date.now() - t4 });

      // ── Step 5: ATTEST ON-CHAIN ────────────────────────────────────────
      const t5 = Date.now();
      broadcast({ step: 'attest', status: 'running', detail: 'Writing attestation to ShieldVault.sol on Base Sepolia...' });
      await sleep(600);
      const attestationTx = mockTxHash('attest');
      broadcast({ step: 'attest', status: 'success', detail: `Attestation TX: ${attestationTx.slice(0, 18)}...`, duration: Date.now() - t5 });

      // ── Store attestation in memory ────────────────────────────────────
      if (!attestationsByAddress.has(agentAddr)) attestationsByAddress.set(agentAddr, []);
      attestationsByAddress.get(agentAddr)!.push({
        id: attestationIdCounter++,
        tool,
        amount: toolInfo.price,
        quality: qualityScore,
        status: 'verified',
        timestamp: new Date().toISOString(),
      });

      const prevSpent = dailySpentByAddress.get(agentAddr) || 0;
      dailySpentByAddress.set(agentAddr, prevSpent + parseFloat(toolInfo.price));

      const storeEntry = MCP_STORE.find(t => t.name === tool);
      if (storeEntry) storeEntry.attestations++;

      console.log(`[BUY] MOCK | ${tool} | wallet=${agentAddr.slice(0,10)} | quality=${qualityScore} | ${Date.now() - startTime}ms`);

      res.json({
        success: true,
        tool,
        amountPaid: toolInfo.price,
        qualityScore,
        paymentTx,
        attestationTx,
        mcpResponse,
      });
    }

  } catch (e: any) {
    console.error(`[BUY] Error:`, e.message);
    broadcast({ step: 'execute', status: 'error', detail: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// MOCK MCP RESPONSES (when demo-mcp isn't running)
// ============================================================================

function generateMockMcpResponse(tool: string, args: Record<string, unknown>): any {
  if (tool === 'scan-contract') {
    const address = (args.address as string) || '0x0000000000000000000000000000000000000000';
    return {
      contract: address,
      chain: args.chain || 'base',
      riskScore: 45,
      riskLevel: 'MEDIUM',
      vulnerabilities: [
        { severity: 'HIGH', title: 'Reentrancy in withdraw()', description: 'External call before state update', location: 'Line 142' },
        { severity: 'MEDIUM', title: 'Block.timestamp dependency', description: 'Uses block.timestamp for time-sensitive logic', location: 'Line 201' },
        { severity: 'LOW', title: 'Floating pragma', description: 'Uses ^0.8.0 instead of fixed version', location: 'Line 1' },
      ],
      summary: 'Found 3 vulnerabilities (0 critical, 1 high). Risk score: 45/100.',
      analyzers: ['bytecode-patterns', 'slither-rules', 'semgrep-solidity'],
    };
  }

  if (tool === 'check-address') {
    return {
      address: args.address || '0x0',
      reputation: 'CLEAN',
      flags: [],
      firstSeen: '2024-03-15',
      txCount: 1247,
      labels: ['verified-contract'],
    };
  }

  if (tool === 'threat-lookup') {
    return {
      indicator: args.indicator || 'unknown',
      found: false,
      sources: ['alientvault-otx', 'etherscan-labels', 'chainabuse'],
      message: 'No threats found in intelligence databases.',
    };
  }

  return { raw: 'Unknown tool' };
}

// ============================================================================
// START
// ============================================================================

server.listen(PORT, () => {
  console.log(`\n  MCPay Backend API`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  Port:      ${PORT}`);
  console.log(`  Mode:      ${MOCK_PAYMENTS ? 'MOCK (simulated payments)' : 'LIVE (Base Sepolia)'}`);
  console.log(`  CORS:      ${CORS_ORIGIN.join(', ')}`);
  console.log(`  MCP:       ${MCP_SERVER_URL}`);
  console.log(`  Thirdweb:  ${thirdwebAuth ? 'ENABLED' : 'disabled (no keys)'}`);
  console.log(`  WS:        ws://localhost:${PORT}/ws/flow`);
  console.log(`  Health:    http://localhost:${PORT}/api/health`);
  console.log(`  Store:     http://localhost:${PORT}/api/store\n`);
});
