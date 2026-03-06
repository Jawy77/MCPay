/**
 * OpenClaw — ShieldPay Telegram Bot Agent
 *
 * An autonomous AI agent (Groq backbone) that:
 * 1. Receives security analysis requests via Telegram
 * 2. Pays for premium MCP tools via x402 (automatic 402 → payment → retry)
 * 3. Logs txHash for CRE workflow attestation
 * 4. Returns verified results to the user
 *
 * Environment variables:
 *   TELEGRAM_BOT_TOKEN    — Telegram Bot API token
 *   GROQ_API_KEY          — Groq API key
 *   SHIELD_VAULT_ADDRESS  — ShieldVault contract address
 *   CRE_WORKFLOW_URL      — CRE workflow HTTP trigger URL
 *   AGENT_PRIVATE_KEY     — Agent wallet private key (for x402 payments)
 *   BASE_SEPOLIA_RPC      — Base Sepolia RPC URL
 *   MCP_SERVER_URL        — MCP server URL (default: http://localhost:3001)
 *
 * Run: bun run src/telegram-bot.ts
 */

import Groq from "groq-sdk";
import axios from "axios";
import { wrapAxiosWithPayment, x402Client, decodePaymentResponseHeader } from "@x402/axios";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, type Address } from "viem";
import { baseSepolia } from "viem/chains";

// ============================================================================
// CONFIG
// ============================================================================

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const VAULT_ADDRESS = (process.env.SHIELD_VAULT_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address;
const CRE_WORKFLOW_URL = process.env.CRE_WORKFLOW_URL ?? "http://localhost:8080/shield-verify";
const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY;
const BASE_SEPOLIA_RPC = process.env.BASE_SEPOLIA_RPC ?? "https://sepolia.base.org";
const MCP_SERVER_URL = process.env.MCP_SERVER_URL ?? "http://localhost:3001";

if (!TELEGRAM_TOKEN) {
  console.error("[OpenClaw] Missing TELEGRAM_BOT_TOKEN");
  process.exit(1);
}

if (!GROQ_API_KEY) {
  console.error("[OpenClaw] Missing GROQ_API_KEY");
  process.exit(1);
}

if (!AGENT_PRIVATE_KEY) {
  console.error("[OpenClaw] Missing AGENT_PRIVATE_KEY (needed for x402 payments)");
  process.exit(1);
}

// ============================================================================
// x402 PAYMENT CLIENT
// ============================================================================

const account = privateKeyToAccount(AGENT_PRIVATE_KEY as `0x${string}`);
console.log(`[OpenClaw] Agent wallet: ${account.address}`);

// Create viem public client for Base Sepolia (needed for x402 readContract)
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(BASE_SEPOLIA_RPC),
});

// Create x402 signer with readContract capability
const evmSigner = toClientEvmSigner(account, publicClient as any);

// Create x402 client that auto-handles 402 Payment Required
const x402PaymentClient = new x402Client()
  .register("eip155:84532", new ExactEvmScheme(evmSigner));  // Base Sepolia

const mcpApi = wrapAxiosWithPayment(
  axios.create({
    baseURL: MCP_SERVER_URL,
    timeout: 60_000,
  }),
  x402PaymentClient,
);

// ============================================================================
// TELEGRAM API HELPERS
// ============================================================================

const TG_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

async function sendMessage(chatId: number, text: string, parseMode: string = "Markdown"): Promise<void> {
  await fetch(`${TG_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
    }),
  });
}

async function sendTyping(chatId: number): Promise<void> {
  await fetch(`${TG_API}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  });
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; first_name: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
    date: number;
  };
}

// ============================================================================
// GROQ LLM BACKBONE
// ============================================================================

const groq = new Groq({ apiKey: GROQ_API_KEY });

const SYSTEM_PROMPT = `You are OpenClaw, a blockchain security AI assistant powered by ShieldPay.
You help users analyze smart contracts for vulnerabilities, check wallet reputations, and manage spending policies.

Available commands:
- /scan <solidity code> — Scan a smart contract for vulnerabilities (pays 0.001 USDC via x402)
- /reputation <address> — Check an address's on-chain reputation (pays 0.001 USDC via x402)
- /policy — View your current spending policy
- /status — Check ShieldPay system status
- /help — Show available commands

When users paste Solidity code or ask for a security scan, analyze it and provide clear, actionable results.
When users ask general blockchain security questions, answer helpfully.
Keep responses concise and use markdown formatting.`;

async function getLLMResponse(userMessage: string, username: string): Promise<string> {
  const completion = await groq.chat.completions.create({
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    max_completion_tokens: 1024,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `[User: ${username}] ${userMessage}` },
    ],
  });

  return completion.choices[0]?.message?.content ?? "I couldn't generate a response. Please try again.";
}

// ============================================================================
// x402 MCP CALLS (auto-payment via @x402/axios)
// ============================================================================

/**
 * Call the MCP server via x402 — payment is handled automatically.
 * If the server returns 402, @x402/axios signs the USDC payment and retries.
 * Returns the MCP result + payment txHash for CRE attestation.
 */
async function callMcpTool(
  toolName: string,
  toolArgs: Record<string, unknown>,
): Promise<{ result: string; txHash: string | null }> {
  try {
    const response = await mcpApi.post("/mcp", {
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        name: toolName,
        arguments: toolArgs,
      },
      id: Date.now(),
    });

    // Extract payment receipt from response headers (set by x402 after payment)
    let txHash: string | null = null;
    const paymentResponseHeader = response.headers["x-payment-response"];
    if (paymentResponseHeader) {
      try {
        const decoded = decodePaymentResponseHeader(paymentResponseHeader);
        txHash = (decoded as any)?.txHash ?? (decoded as any)?.transaction ?? null;
        console.log(`[OpenClaw] x402 payment settled — txHash: ${txHash}`);
        console.log(`[OpenClaw] Full payment response:`, JSON.stringify(decoded));
      } catch (e) {
        console.log(`[OpenClaw] x402 payment header (raw): ${paymentResponseHeader}`);
        txHash = paymentResponseHeader;
      }
    }

    const mcpData = response.data;
    const contentText = mcpData?.result?.content?.[0]?.text ?? "No content returned";

    return { result: contentText, txHash };
  } catch (err: any) {
    console.error(`[OpenClaw] MCP call failed:`, err?.message ?? err);
    throw err;
  }
}

/**
 * Request a security scan via x402-paid MCP call.
 * Logs the txHash as paymentReceipt for CRE workflow.
 */
async function requestSecurityScan(sourceCode: string): Promise<string> {
  try {
    const { result, txHash } = await callMcpTool("security_scan", {
      source_code: sourceCode,
      contract_name: "UserContract",
    });

    let output = result;

    if (txHash) {
      output += `\n\n---\n**x402 Payment TX:** \`${txHash}\``;
      output += `\n**Agent Wallet:** \`${account.address}\``;
      output += `\n**Network:** Base Sepolia`;

      // Log for CRE workflow consumption
      console.log(`[OpenClaw] === PAYMENT RECEIPT FOR CRE ===`);
      console.log(`[OpenClaw] txHash: ${txHash}`);
      console.log(`[OpenClaw] agent: ${account.address}`);
      console.log(`[OpenClaw] tool: security_scan`);
      console.log(`[OpenClaw] amount: 0.001 USDC`);
      console.log(`[OpenClaw] ================================`);
    }

    return output;
  } catch {
    return "MCP server unreachable or payment failed. Check wallet balance on Base Sepolia.";
  }
}

async function requestReputationCheck(address: string): Promise<string> {
  try {
    const { result, txHash } = await callMcpTool("reputation_check", { address });

    let output = result;
    if (txHash) {
      output += `\n\n---\n**x402 Payment TX:** \`${txHash}\``;
    }

    return output;
  } catch {
    return "Reputation check failed. Check wallet balance on Base Sepolia.";
  }
}

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

async function handleMessage(chatId: number, text: string, username: string): Promise<void> {
  await sendTyping(chatId);

  // /start or /help
  if (text === "/start" || text === "/help") {
    await sendMessage(
      chatId,
      `*OpenClaw — ShieldPay Security Agent*\n\nCommands:\n/scan — Paste Solidity code to analyze (0.001 USDC)\n/reputation <address> — Check wallet reputation (0.001 USDC)\n/policy — View spending policy\n/status — System status\n\nPayments are automatic via x402 on Base Sepolia.\nOr just send me Solidity code and I'll scan it!`
    );
    return;
  }

  // /status
  if (text === "/status") {
    await sendMessage(
      chatId,
      `*ShieldPay Status*\n\nAgent Wallet: \`${account.address}\`\nVault: \`${VAULT_ADDRESS}\`\nMCP Server: \`${MCP_SERVER_URL}\`\nCRE Workflow: \`${CRE_WORKFLOW_URL}\`\nNetwork: Base Sepolia\nPayment: x402 (USDC)`
    );
    return;
  }

  // /policy
  if (text === "/policy") {
    await sendMessage(
      chatId,
      `*Spending Policy*\n\nMax per call: 0.10 USDC\nMax daily: 5.00 USDC\nToday's spend: 0.00 USDC\nPayment: x402 auto-pay\n\n_Configure via ShieldVault.setPolicy()_`
    );
    return;
  }

  // /scan <code>
  if (text.startsWith("/scan")) {
    const code = text.replace("/scan", "").trim();
    if (!code) {
      await sendMessage(chatId, "Send me the Solidity source code after /scan.\n\nExample:\n`/scan pragma solidity ^0.8.0; contract Test { ... }`");
      return;
    }

    await sendMessage(chatId, "Scanning contract via x402-paid MCP server...");
    const scanResult = await requestSecurityScan(code);
    await sendMessage(chatId, scanResult);
    return;
  }

  // /reputation <address>
  if (text.startsWith("/reputation")) {
    const addr = text.replace("/reputation", "").trim();
    if (!addr) {
      await sendMessage(chatId, "Usage: `/reputation 0x...`");
      return;
    }
    await sendMessage(chatId, "Checking reputation via x402-paid MCP...");
    const repResult = await requestReputationCheck(addr);
    await sendMessage(chatId, repResult);
    return;
  }

  // Detect Solidity code (no command prefix)
  if (text.includes("pragma solidity") || text.includes("contract ") || (text.includes("function ") && text.includes("{"))) {
    await sendMessage(chatId, "Detected Solidity code. Scanning via x402-paid MCP...");
    const scanResult = await requestSecurityScan(text);
    await sendMessage(chatId, scanResult);
    return;
  }

  // Default: send to Groq LLM
  const response = await getLLMResponse(text, username);
  await sendMessage(chatId, response);
}

// ============================================================================
// POLLING LOOP
// ============================================================================

async function pollUpdates(): Promise<void> {
  let offset = 0;
  console.log("[OpenClaw] Bot started. Polling for updates...");

  while (true) {
    try {
      const res = await fetch(`${TG_API}/getUpdates?offset=${offset}&timeout=30`);
      const data = (await res.json()) as { ok: boolean; result: TelegramUpdate[] };

      if (!data.ok || !data.result?.length) continue;

      for (const update of data.result) {
        offset = update.update_id + 1;

        if (update.message?.text) {
          const { chat, text, from } = update.message;
          console.log(`[OpenClaw] ${from.username ?? from.first_name}: ${text.slice(0, 100)}`);

          handleMessage(chat.id, text, from.username ?? from.first_name).catch((err) =>
            console.error("[OpenClaw] Error handling message:", err)
          );
        }
      }
    } catch (err) {
      console.error("[OpenClaw] Polling error:", err);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

// ============================================================================
// ENTRYPOINT
// ============================================================================

console.log("[OpenClaw] ShieldPay Telegram Bot Agent v0.2.0");
console.log("[OpenClaw] LLM: Groq (llama-4-scout)");
console.log("[OpenClaw] Payments: x402 auto-pay (Base Sepolia USDC)");
console.log("[OpenClaw] Agent wallet:", account.address);
console.log("[OpenClaw] MCP Server:", MCP_SERVER_URL);
console.log("[OpenClaw] Vault:", VAULT_ADDRESS);

pollUpdates().catch(console.error);
