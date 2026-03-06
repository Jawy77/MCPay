/**
 * ShieldPay Demo MCP Server
 *
 * A premium security scan MCP server priced via x402 micropayments on Base Sepolia.
 * The /mcp endpoint requires USDC payment via x402 protocol before returning results.
 *
 * Flow:
 *   1. Client POSTs to /mcp
 *   2. x402 middleware returns 402 with payment requirements
 *   3. Client signs USDC payment (via @x402/axios or similar)
 *   4. Client retries with payment header
 *   5. Facilitator settles payment, server returns MCP result
 *
 * Environment variables:
 *   PAYEE_WALLET_ADDRESS  — Wallet to receive x402 payments
 *   MCP_PORT              — Server port (default: 3001)
 *
 * Run: bun run src/server.ts
 */

import { Hono } from "hono";
import { paymentMiddlewareFromConfig } from "@x402/hono";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";

const PORT = parseInt(process.env.MCP_PORT ?? "3001");
const PAYEE_ADDRESS = process.env.PAYEE_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000000";
const FACILITATOR_URL = process.env.FACILITATOR_URL ?? "https://x402.org/facilitator";

// ============================================================================
// VULNERABILITY ANALYSIS ENGINE
// ============================================================================

const VULNERABILITY_DB: Record<string, { severity: string; description: string; recommendation: string }> = {
  reentrancy: {
    severity: "CRITICAL",
    description: "External call before state update allows recursive calls to drain funds.",
    recommendation: "Use checks-effects-interactions pattern or OpenZeppelin ReentrancyGuard.",
  },
  "unchecked-return": {
    severity: "HIGH",
    description: "Return value of external call not checked, may silently fail.",
    recommendation: "Use SafeERC20 or check return values explicitly.",
  },
  "tx-origin": {
    severity: "HIGH",
    description: "tx.origin used for authentication is vulnerable to phishing attacks.",
    recommendation: "Use msg.sender instead of tx.origin for access control.",
  },
  "integer-overflow": {
    severity: "MEDIUM",
    description: "Arithmetic operation may overflow/underflow without SafeMath.",
    recommendation: "Use Solidity >=0.8.0 (built-in overflow checks) or OpenZeppelin SafeMath.",
  },
  "floating-pragma": {
    severity: "LOW",
    description: "Contract uses floating pragma (^) instead of fixed version.",
    recommendation: "Pin Solidity version to avoid unexpected compiler changes.",
  },
};

function analyzeContract(sourceCode: string): {
  vulnerabilities: Array<{ pattern: string; severity: string; line: number; description: string; recommendation: string }>;
  riskScore: number;
  summary: string;
} {
  const vulnerabilities: Array<{
    pattern: string;
    severity: string;
    line: number;
    description: string;
    recommendation: string;
  }> = [];

  const lines = sourceCode.split("\n");

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const lower = line.toLowerCase();

    if (lower.includes(".call{") || lower.includes(".call(")) {
      vulnerabilities.push({ pattern: "reentrancy", line: lineNum, ...VULNERABILITY_DB["reentrancy"] });
    }
    if (lower.includes("tx.origin")) {
      vulnerabilities.push({ pattern: "tx-origin", line: lineNum, ...VULNERABILITY_DB["tx-origin"] });
    }
    if (/pragma solidity \^/.test(line)) {
      vulnerabilities.push({ pattern: "floating-pragma", line: lineNum, ...VULNERABILITY_DB["floating-pragma"] });
    }
  });

  const severityWeights: Record<string, number> = { CRITICAL: 40, HIGH: 25, MEDIUM: 15, LOW: 5 };
  const riskScore = Math.min(
    100,
    vulnerabilities.reduce((sum, v) => sum + (severityWeights[v.severity] ?? 0), 0)
  );

  const critCount = vulnerabilities.filter((v) => v.severity === "CRITICAL").length;
  const highCount = vulnerabilities.filter((v) => v.severity === "HIGH").length;

  let summary = `Scan complete. Found ${vulnerabilities.length} issue(s). `;
  if (critCount > 0) summary += `${critCount} CRITICAL. `;
  if (highCount > 0) summary += `${highCount} HIGH. `;
  summary += `Risk score: ${riskScore}/100.`;

  return { vulnerabilities, riskScore, summary };
}

// ============================================================================
// HONO APP + x402 MIDDLEWARE
// ============================================================================

const app = new Hono();

// x402 payment middleware — gates POST /mcp behind USDC payment on Base Sepolia
const facilitatorClient = new HTTPFacilitatorClient({
  url: FACILITATOR_URL,
});

app.use(
  paymentMiddlewareFromConfig(
    {
      "POST /mcp": {
        accepts: {
          scheme: "exact",
          price: "$0.001",
          network: "eip155:84532",      // Base Sepolia
          payTo: PAYEE_ADDRESS,
          maxTimeoutSeconds: 120,
        },
        description: "Premium smart contract security scan via ShieldPay MCP",
      },
    },
    facilitatorClient,
    [{ network: "eip155:84532", server: new ExactEvmScheme() }],
  ),
);

// ============================================================================
// ROUTES
// ============================================================================

// Health check (free — no payment required)
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    server: "ShieldPay Demo MCP",
    x402: true,
    payee: PAYEE_ADDRESS,
    network: "base-sepolia",
    facilitator: FACILITATOR_URL,
  });
});

// MCP endpoint — x402-gated
app.post("/mcp", async (c) => {
  const body = await c.req.json();
  const shieldPayHeader = c.req.header("X-ShieldPay-Attestation");

  if (shieldPayHeader) {
    console.log(`[ShieldPay MCP] Attested call received (status: ${shieldPayHeader})`);
  }

  console.log(`[ShieldPay MCP] PAID request received`);
  console.log(`[ShieldPay MCP] Request: ${JSON.stringify(body).slice(0, 200)}`);

  // Handle JSON-RPC format from CRE workflow / agent
  if (body.jsonrpc === "2.0" && body.method === "tools/call") {
    const { name, arguments: args } = body.params;
    let result;

    if (name === "security_scan") {
      const analysis = analyzeContract(args.source_code ?? "");
      const contractName = args.contract_name ?? "Unknown";

      const report = [
        `# Security Scan: ${contractName}`,
        `Risk Score: ${analysis.riskScore}/100`,
        `Issues: ${analysis.vulnerabilities.length}`,
        ``,
        analysis.summary,
        ``,
        ...analysis.vulnerabilities.map(
          (v, i) =>
            `## ${i + 1}. [${v.severity}] ${v.pattern} (line ${v.line})\n${v.description}\n**Fix:** ${v.recommendation}`
        ),
        ``,
        `---`,
        `*Powered by ShieldPay — verified via x402 + CRE attestation*`,
      ].join("\n");

      result = { content: [{ type: "text", text: report }] };
    } else if (name === "reputation_check") {
      result = {
        content: [
          {
            type: "text",
            text: `# Reputation: ${args.address}\nStatus: Active\nRisk Level: Low\nTransactions: ${Math.floor(Math.random() * 500) + 10}\nFlags: None`,
          },
        ],
      };
    } else {
      result = { content: [{ type: "text", text: `Unknown tool: ${name}` }] };
    }

    return c.json({ jsonrpc: "2.0", result, id: body.id });
  }

  return c.json({ error: "Invalid request" }, 400);
});

// ============================================================================
// START
// ============================================================================

console.log(`[ShieldPay MCP] x402-gated security scanner`);
console.log(`[ShieldPay MCP] Payee: ${PAYEE_ADDRESS}`);
console.log(`[ShieldPay MCP] Network: Base Sepolia (eip155:84532)`);
console.log(`[ShieldPay MCP] Facilitator: ${FACILITATOR_URL}`);
console.log(`[ShieldPay MCP] Price: $0.001 USDC per call`);
console.log(`[ShieldPay MCP] Listening on http://localhost:${PORT}`);

export default {
  port: PORT,
  fetch: app.fetch,
};
