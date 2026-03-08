import TelegramBot from 'node-telegram-bot-api';
import Groq from 'groq-sdk';
import axios from 'axios';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(import.meta.dirname ?? '.', '..', '.env') });

// ============================================================================
// CONFIG
// ============================================================================

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const GROQ_KEY = process.env.GROQ_API_KEY!;
const LLM_MODEL = process.env.LLM_MODEL || 'llama-3.1-8b-instant';
const MCPAY_BACKEND = process.env.MCPAY_BACKEND_URL || 'http://localhost:4000';

if (!TELEGRAM_TOKEN) { console.error('TELEGRAM_BOT_TOKEN missing in .env'); process.exit(1); }
if (!GROQ_KEY) { console.error('GROQ_API_KEY missing in .env'); process.exit(1); }

// ============================================================================
// INIT
// ============================================================================

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const groq = new Groq({ apiKey: GROQ_KEY });
const api = axios.create({ baseURL: MCPAY_BACKEND, timeout: 30_000 });

console.log(`\n  MCPay Agent (OpenClaw)`);
console.log(`  ─────────────────────────────────`);
console.log(`  LLM:      Groq/${LLM_MODEL}`);
console.log(`  Backend:  ${MCPAY_BACKEND}`);
console.log(`  Bot:      Starting Telegram polling...\n`);

// ============================================================================
// MCPay BACKEND CLIENT
// ============================================================================

interface BuyResult {
  success: boolean;
  tool: string;
  amountPaid: string;
  qualityScore: number;
  paymentTx: string;
  attestationTx: string;
  mcpResponse: any;
}

async function buyTool(tool: string, args: Record<string, unknown>): Promise<BuyResult> {
  const res = await api.post('/api/buy', { tool, args });
  return res.data;
}

function formatReceipt(result: BuyResult): string {
  return [
    `\n*MCPay Receipt*`,
    `Tool: \`${result.tool}\``,
    `Paid: ${result.amountPaid} USDC`,
    `Quality: ${result.qualityScore}/100`,
    `Payment TX: \`${result.paymentTx.slice(0, 22)}...\``,
    `Attestation: \`${result.attestationTx.slice(0, 22)}...\``,
    `_Verified on Base Sepolia via Chainlink CRE_`,
  ].join('\n');
}

// ============================================================================
// LLM (Groq)
// ============================================================================

const SYSTEM_PROMPT = `You are MCPay Agent (codename: OpenClaw), an autonomous DeFi security agent.
You help users scan smart contracts for vulnerabilities using premium MCP security tools.

You have access to these security tools via MCPay:
- scan-contract: Full vulnerability scan ($0.001 USDC) - needs 'address' param
- check-address: Address reputation check ($0.001 USDC) - needs 'address' param
- threat-lookup: Threat intel lookup ($0.001 USDC) - needs 'indicator' param

Payments are verified via Chainlink CRE with on-chain attestation on Base Sepolia.

When a user asks to scan or check something:
1. Identify which tool to use
2. Extract the address/indicator from their message
3. Report back with the results in a clear, security-analyst style

Always respond in the user's language. Be concise but thorough on security findings.
Format vulnerability reports clearly with severity levels and recommendations.`;

async function askLLM(userMessage: string, context?: string): Promise<string> {
  const messages: any[] = [{ role: 'system', content: SYSTEM_PROMPT }];

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

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, `*MCPay Agent (OpenClaw)*

Autonomous DeFi security scanner with verified payments.

*Commands:*
/scan \`0xAddress\` — Full vulnerability scan ($0.001)
/check \`0xAddress\` — Address reputation ($0.001)
/threat \`indicator\` — Threat intel lookup ($0.001)
/tools — List available MCP tools
/status — Agent status

Or just describe what you need and I'll figure out the right tool.

_Payments verified via Chainlink CRE on Base Sepolia_`, { parse_mode: 'Markdown' });
});

bot.onText(/\/tools/, async (msg) => {
  try {
    const res = await api.get('/api/store');
    const tools = res.data.tools;
    let text = '*Available MCP Tools:*\n\n';
    for (const t of tools) {
      text += `*${t.name}* — ${t.description}\n  $${t.price} USDC | ${t.attestations} attestations\n\n`;
    }
    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
  } catch (e: any) {
    bot.sendMessage(msg.chat.id, `Error connecting to MCPay backend: ${e.message}`);
  }
});

bot.onText(/\/status/, async (msg) => {
  let backendStatus = 'Offline';
  try {
    const res = await api.get('/api/health');
    if (res.data.status === 'ok') backendStatus = 'Online';
  } catch {}

  bot.sendMessage(msg.chat.id, `*MCPay Agent Status*

Bot: Online
LLM: Groq/${LLM_MODEL}
Backend: ${backendStatus}
CRE Verification: Enabled

_Network: Base Sepolia (testnet)_`, { parse_mode: 'Markdown' });
});

// /scan <address>
bot.onText(/\/scan\s+(0x[a-fA-F0-9]{40})/, async (msg, match) => {
  const address = match![1];
  const chatId = msg.chat.id;

  bot.sendMessage(chatId, `Scanning contract \`${address}\`...\nRunning MCPay verified scan...`, { parse_mode: 'Markdown' });

  try {
    const result = await buyTool('scan-contract', { address, chain: 'base' });
    const mcpData = result.mcpResponse;

    const analysis = await askLLM(
      `Analyze this smart contract scan result and give me a security report for contract ${address}:`,
      JSON.stringify(mcpData, null, 2)
    );

    const report = `*Security Report*\nContract: \`${address}\`\n\n${analysis}\n${formatReceipt(result)}`;
    bot.sendMessage(chatId, report, { parse_mode: 'Markdown' });
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
    const result = await buyTool('check-address', { address });

    const analysis = await askLLM(
      `Give me a quick reputation report for address ${address}:`,
      JSON.stringify(result.mcpResponse, null, 2)
    );

    const report = `*Address Report*\n\`${address}\`\n\n${analysis}\n${formatReceipt(result)}`;
    bot.sendMessage(chatId, report, { parse_mode: 'Markdown' });
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
    const result = await buyTool('threat-lookup', { indicator });

    const analysis = await askLLM(
      `Report threat intelligence results for ${indicator}:`,
      JSON.stringify(result.mcpResponse, null, 2)
    );

    const report = `*Threat Intel Report*\n\n${analysis}\n${formatReceipt(result)}`;
    bot.sendMessage(chatId, report, { parse_mode: 'Markdown' });
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
    if (addressMatch && /scan|vuln|audit|secur|analyz|review/i.test(userText)) {
      bot.sendMessage(chatId, `Analyzing \`${addressMatch[0]}\`...`, { parse_mode: 'Markdown' });

      const result = await buyTool('scan-contract', { address: addressMatch[0] });
      const analysis = await askLLM(
        `The user asked: "${userText}". Here are the scan results for ${addressMatch[0]}:`,
        JSON.stringify(result.mcpResponse, null, 2)
      );

      const report = `*Security Report*\n\`${addressMatch[0]}\`\n\n${analysis}\n${formatReceipt(result)}`;
      bot.sendMessage(chatId, report, { parse_mode: 'Markdown' });
    } else {
      const response = await askLLM(userText);
      bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    }
  } catch (e: any) {
    bot.sendMessage(chatId, `Error: ${e.message}`);
  }
});

console.log('MCPay Agent is running. Send /start to your Telegram bot.');
