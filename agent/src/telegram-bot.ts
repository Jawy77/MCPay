import TelegramBot from 'node-telegram-bot-api';
import Groq from 'groq-sdk';
import axios from 'axios';
import { wrapAxiosWithPayment, x402Client, decodePaymentResponseHeader } from '@x402/axios';
import { ExactEvmScheme, toClientEvmSigner } from '@x402/evm';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from project root
config({ path: resolve(import.meta.dirname ?? '.', '..', '.env') });

// ============================================================================
// CONFIG
// ============================================================================

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const GROQ_KEY = process.env.GROQ_API_KEY!;
const LLM_MODEL = process.env.LLM_MODEL || 'llama-3.3-70b-versatile';
const MCP_SERVER = process.env.MCP_SERVER_URL || 'http://localhost:3001';
const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY!;
const BASE_SEPOLIA_RPC = process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org';

if (!TELEGRAM_TOKEN) { console.error('TELEGRAM_BOT_TOKEN missing in .env'); process.exit(1); }
if (!GROQ_KEY) { console.error('GROQ_API_KEY missing in .env'); process.exit(1); }
if (!AGENT_PRIVATE_KEY) { console.error('AGENT_PRIVATE_KEY missing in .env (needed for x402 payments)'); process.exit(1); }

// ============================================================================
// x402 PAYMENT CLIENT — auto-pays USDC on Base Sepolia
// ============================================================================

const account = privateKeyToAccount(AGENT_PRIVATE_KEY as `0x${string}`);

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(BASE_SEPOLIA_RPC),
});

const evmSigner = toClientEvmSigner(account, publicClient as any);

const x402PaymentClient = new x402Client()
  .register('eip155:84532', new ExactEvmScheme(evmSigner));

// Axios instance that auto-handles 402 → payment → retry
const mcpApi = wrapAxiosWithPayment(
  axios.create({ baseURL: MCP_SERVER, timeout: 60_000 }),
  x402PaymentClient,
);

// ============================================================================
// INIT
// ============================================================================

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const groq = new Groq({ apiKey: GROQ_KEY });

console.log(`\n  ShieldPay Agent (OpenClaw)`);
console.log(`   LLM: Groq/${LLM_MODEL}`);
console.log(`   MCP: ${MCP_SERVER}`);
console.log(`   Agent wallet: ${account.address}`);
console.log(`   Payments: x402 auto-pay (Base Sepolia USDC)`);
console.log(`   Bot: Starting Telegram polling...\n`);

// ============================================================================
// USDC BALANCE HELPER
// ============================================================================

const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const USDC_ABI = [{ inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' }] as const;

async function getUSDCBalance(): Promise<string> {
  try {
    const balance = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: 'balanceOf',
      args: [account.address],
    });
    return (Number(balance) / 1e6).toFixed(4);
  } catch {
    return '?.??';
  }
}

async function sendPaymentNotification(chatId: number, tool: string, txHash: string | null) {
  const balance = await getUSDCBalance();
  const txShort = txHash ? txHash.slice(0, 18) + '...' : 'n/a';
  bot.sendMessage(chatId, `MCPay: Paid 0.001 USDC for ${tool}. TX: \`${txShort}\` Balance: ${balance} USDC`, { parse_mode: 'Markdown' });
}

// ============================================================================
// MCP CLIENT (x402-paid)
// ============================================================================

async function callMCP(toolName: string, args: Record<string, unknown>): Promise<{ data: any; txHash: string | null }> {
  console.log(`[MCP] Calling ${toolName} with:`, args);

  const res = await mcpApi.post('/mcp', {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: { name: toolName, arguments: args },
    id: Date.now(),
  });

  // Extract payment txHash from x402 response headers
  let txHash: string | null = null;
  const paymentHeader = res.headers['x-payment-response'];
  if (paymentHeader) {
    try {
      const decoded = decodePaymentResponseHeader(paymentHeader);
      txHash = (decoded as any)?.txHash ?? (decoded as any)?.transaction ?? paymentHeader;
      console.log(`[x402] Payment settled — txHash: ${txHash}`);
      console.log(`[x402] Full receipt:`, JSON.stringify(decoded));
    } catch {
      txHash = paymentHeader;
      console.log(`[x402] Payment header (raw): ${paymentHeader}`);
    }
  }

  const data = res.data;

  if (data.error) {
    throw new Error(`MCP error: ${data.error.message}`);
  }

  const text = data?.result?.content?.[0]?.text;
  let parsed;
  if (text) {
    try { parsed = JSON.parse(text); }
    catch { parsed = { raw: text }; }
  } else {
    parsed = data.result;
  }

  return { data: parsed, txHash };
}

async function listMCPTools(): Promise<any[]> {
  // GET /mcp is free (not x402-gated)
  const res = await axios.get(`${MCP_SERVER}/mcp`);
  return res.data?.result?.tools || [];
}

// ============================================================================
// LLM (Groq)
// ============================================================================

const SYSTEM_PROMPT = `You are ShieldPay Agent (codename: OpenClaw), an autonomous DeFi security agent.
You help users scan smart contracts for vulnerabilities using premium MCP security tools.

You have access to these security tools via ShieldPay's x402-paid MCP:
- scan-contract: Full vulnerability scan ($0.001 USDC) - needs 'address' param
- check-address: Address reputation check ($0.001 USDC) - needs 'address' param
- threat-lookup: Threat intel lookup ($0.001 USDC) - needs 'indicator' param

Payments are automatic via x402 on Base Sepolia. The agent wallet pays USDC.

When a user asks to scan or check something:
1. Identify which tool to use
2. Extract the address/indicator from their message
3. Report back with the results in a clear, security-analyst style

Always respond in the user's language. Be concise but thorough on security findings.
Format vulnerability reports clearly with severity levels and recommendations.

You are powered by Chainlink CRE for payment verification and on-chain attestation.`;

async function askLLM(userMessage: string, context?: string): Promise<string> {
  const messages: any[] = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  if (context) {
    messages.push({ role: 'system', content: `MCP Tool Result:\n${context}` });
  }

  messages.push({ role: 'user', content: userMessage });

  const completion = await groq.chat.completions.create({
    model: LLM_MODEL,
    messages,
    temperature: 0.3,
    max_tokens: 1500,
  });

  return completion.choices[0]?.message?.content || 'No response from LLM.';
}

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

// /start
bot.onText(/\/start/, async (msg) => {
  const welcome = `*ShieldPay Agent (OpenClaw)*

Autonomous DeFi security scanner with x402 payments + CRE attestation.

*Commands:*
/scan \`0xAddress\` — Full vulnerability scan ($0.001)
/check \`0xAddress\` — Address reputation ($0.001)
/threat \`indicator\` — Threat intel lookup ($0.001)
/tools — List available MCP tools
/status — Agent status

Or just describe what you need and I'll figure out the right tool.

_Payments: x402 auto-pay (Base Sepolia USDC)_
_Powered by Chainlink CRE + x402_`;

  bot.sendMessage(msg.chat.id, welcome, { parse_mode: 'Markdown' });
});

// /tools
bot.onText(/\/tools/, async (msg) => {
  try {
    const tools = await listMCPTools();
    let text = '*Available MCP Tools:*\n\n';
    for (const t of tools) {
      text += `*${t.name}* — ${t.description}\n  ${t.price}\n\n`;
    }
    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
  } catch (e: any) {
    bot.sendMessage(msg.chat.id, `Error connecting to MCP server: ${e.message}`);
  }
});

// /status
bot.onText(/\/status/, async (msg) => {
  let mcpStatus = 'Offline';
  try {
    const res = await axios.get(`${MCP_SERVER}/health`);
    if (res.status === 200) mcpStatus = 'Online';
  } catch {}

  bot.sendMessage(msg.chat.id, `*ShieldPay Agent Status*

Bot: Online
LLM: Groq/${LLM_MODEL}
MCP Server: ${mcpStatus}
Agent Wallet: \`${account.address}\`
x402 Payments: Enabled (Base Sepolia USDC)
CRE Workflow: Simulation mode

_Network: Base Sepolia (testnet)_`, { parse_mode: 'Markdown' });
});

// /scan <address>
bot.onText(/\/scan\s+(0x[a-fA-F0-9]{40})/, async (msg, match) => {
  const address = match![1];
  const chatId = msg.chat.id;

  bot.sendMessage(chatId, `*Scanning contract:* \`${address}\`\n\nRunning x402-paid ShieldPay scan...`, { parse_mode: 'Markdown' });

  try {
    const { data: result, txHash } = await callMCP('scan-contract', { address, chain: 'base' });

    const analysis = await askLLM(
      `Analyze this smart contract scan result and give me a security report for contract ${address}:`,
      JSON.stringify(result, null, 2)
    );

    let header = `*ShieldPay Scan Report*
Contract: \`${address}\`
Risk Score: *${result.riskScore}/100* (${result.riskLevel})
Vulnerabilities: ${result.vulnerabilities?.length || 0}
${result.timestamp}`;

    if (txHash) {
      header += `\nx402 Payment TX: \`${txHash}\``;
      console.log(`[CRE-RECEIPT] txHash=${txHash} agent=${account.address} tool=scan-contract amount=0.001`);
      sendPaymentNotification(chatId, 'scan-contract', txHash);
    }

    header += '\n\n---\n\n';
    bot.sendMessage(chatId, header + analysis, { parse_mode: 'Markdown' });

  } catch (e: any) {
    bot.sendMessage(chatId, `Scan failed: ${e.message}`);
  }
});

// /check <address>
bot.onText(/\/check\s+(0x[a-fA-F0-9]{40})/, async (msg, match) => {
  const address = match![1];
  const chatId = msg.chat.id;

  bot.sendMessage(chatId, `Checking address reputation: \`${address}\`...`, { parse_mode: 'Markdown' });

  try {
    const { data: result, txHash } = await callMCP('check-address', { address });
    const analysis = await askLLM(
      `Give me a quick reputation report for address ${address}:`,
      JSON.stringify(result, null, 2)
    );

    let response = `*Address Report*\n\`${address}\`\n\n${analysis}`;
    if (txHash) {
      response += `\n\n_x402 TX: \`${txHash}\`_`;
      console.log(`[CRE-RECEIPT] txHash=${txHash} agent=${account.address} tool=check-address amount=0.001`);
      sendPaymentNotification(chatId, 'check-address', txHash);
    }

    bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
  } catch (e: any) {
    bot.sendMessage(chatId, `Check failed: ${e.message}`);
  }
});

// /threat <indicator>
bot.onText(/\/threat\s+(.+)/, async (msg, match) => {
  const indicator = match![1].trim();
  const chatId = msg.chat.id;

  bot.sendMessage(chatId, `Looking up threat intel for: \`${indicator}\`...`, { parse_mode: 'Markdown' });

  try {
    const { data: result, txHash } = await callMCP('threat-lookup', { indicator });
    const analysis = await askLLM(
      `Report threat intelligence results for ${indicator}:`,
      JSON.stringify(result, null, 2)
    );

    let response = `*Threat Intel Report*\n\n${analysis}`;
    if (txHash) {
      response += `\n\n_x402 TX: \`${txHash}\`_`;
      console.log(`[CRE-RECEIPT] txHash=${txHash} agent=${account.address} tool=threat-lookup amount=0.001`);
      sendPaymentNotification(chatId, 'threat-lookup', txHash);
    }

    bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
  } catch (e: any) {
    bot.sendMessage(chatId, `Lookup failed: ${e.message}`);
  }
});

// Free-text: use LLM to figure out intent
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const chatId = msg.chat.id;
  const userText = msg.text;

  const addressMatch = userText.match(/0x[a-fA-F0-9]{40}/);

  try {
    if (addressMatch) {
      bot.sendMessage(chatId, `Analyzing your request...`);

      if (/scan|vuln|audit|secur|analyz|review/i.test(userText)) {
        const { data: result, txHash } = await callMCP('scan-contract', { address: addressMatch[0] });
        const analysis = await askLLM(
          `The user asked: "${userText}". Here are the scan results for ${addressMatch[0]}. Give a clear report:`,
          JSON.stringify(result, null, 2)
        );

        let response = `*Security Report*\n\`${addressMatch[0]}\`\n\n${analysis}`;
        if (txHash) {
          response += `\n\n_x402 TX: \`${txHash}\`_`;
          console.log(`[CRE-RECEIPT] txHash=${txHash} agent=${account.address} tool=scan-contract amount=0.001`);
          sendPaymentNotification(chatId, 'scan-contract', txHash);
        }

        bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
      } else {
        const intent = await askLLM(
          `User says: "${userText}". They mentioned address ${addressMatch[0]}. What should I do? Just scan the contract if they want security analysis, check the address if they want reputation, or do a threat lookup. Respond with your analysis.`,
        );
        bot.sendMessage(chatId, intent, { parse_mode: 'Markdown' });
      }
    } else {
      const response = await askLLM(userText);
      bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    }
  } catch (e: any) {
    bot.sendMessage(chatId, `Error: ${e.message}`);
  }
});

console.log('ShieldPay Agent is running. Send /start to your Telegram bot.');
