/**
 * ShieldPay Demo MCP Server
 *
 * A premium security scan MCP server priced via x402 micropayments.
 * Exposes MCP tools for smart contract security analysis.
 *
 * This server is called by the CRE workflow during Step 3 (Service Delivery).
 * The X-ShieldPay-Attestation header signals that the call is being attested.
 *
 * Run: bun run src/server.ts
 * Listens on: http://localhost:3001/mcp
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const PORT = parseInt(process.env.MCP_PORT ?? "3001");

// Known vulnerability patterns for demo purposes
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

// Simulated security analysis engine
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
      // Check for reentrancy pattern: external call possibly before state update
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

// Create MCP server
const server = new McpServer({
  name: "ShieldPay Security Scanner",
  version: "0.1.0",
});

// Tool: security_scan — Analyze a Solidity smart contract for vulnerabilities
server.tool(
  "security_scan",
  "Analyze a Solidity smart contract for common vulnerabilities. Costs 0.05 USDC via x402.",
  {
    source_code: z.string().describe("Solidity source code to analyze"),
    contract_name: z.string().optional().describe("Name of the contract (for reporting)"),
  },
  async ({ source_code, contract_name }) => {
    const name = contract_name ?? "Unknown";
    const result = analyzeContract(source_code);

    const report = [
      `# Security Scan Report: ${name}`,
      ``,
      `**Risk Score:** ${result.riskScore}/100`,
      `**Issues Found:** ${result.vulnerabilities.length}`,
      ``,
      `## Summary`,
      result.summary,
      ``,
      `## Vulnerabilities`,
      ...result.vulnerabilities.map(
        (v, i) =>
          `### ${i + 1}. [${v.severity}] ${v.pattern} (line ${v.line})\n${v.description}\n**Fix:** ${v.recommendation}`
      ),
      ``,
      result.vulnerabilities.length === 0 ? "No vulnerabilities detected." : "",
      ``,
      `---`,
      `*Powered by ShieldPay Security Scanner — verified via CRE attestation*`,
    ].join("\n");

    return {
      content: [{ type: "text" as const, text: report }],
    };
  }
);

// Tool: reputation_check — Check an address's on-chain reputation
server.tool(
  "reputation_check",
  "Check the on-chain reputation of a wallet or contract address. Costs 0.01 USDC via x402.",
  {
    address: z.string().describe("Ethereum address to check"),
  },
  async ({ address }) => {
    // Demo: return simulated reputation data
    const report = [
      `# Reputation Report: ${address}`,
      ``,
      `**Status:** Active`,
      `**First Seen:** 2025-09-15`,
      `**Transaction Count:** ${Math.floor(Math.random() * 500) + 10}`,
      `**Risk Level:** Low`,
      `**Associated Protocols:** Uniswap, Aave, Base Bridge`,
      `**Flags:** None`,
      ``,
      `---`,
      `*Powered by ShieldPay Security Scanner*`,
    ].join("\n");

    return {
      content: [{ type: "text" as const, text: report }],
    };
  }
);

// Start the HTTP transport
async function main() {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  const httpServer = Bun.serve({
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url);

      // Health check
      if (url.pathname === "/health") {
        return new Response(JSON.stringify({ status: "ok", server: "ShieldPay Demo MCP" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // MCP endpoint
      if (url.pathname === "/mcp" && req.method === "POST") {
        const body = await req.json();
        const shieldPayHeader = req.headers.get("X-ShieldPay-Attestation");

        if (shieldPayHeader) {
          console.log(`[ShieldPay MCP] Attested call received (status: ${shieldPayHeader})`);
        }

        console.log(`[ShieldPay MCP] Request: ${JSON.stringify(body).slice(0, 200)}`);

        // Handle JSON-RPC format from CRE workflow
        if (body.jsonrpc === "2.0" && body.method === "tools/call") {
          const { name, arguments: args } = body.params;
          let result;

          if (name === "security_scan") {
            const analysis = analyzeContract(args.source_code ?? "");
            const contractName = args.contract_name ?? "Unknown";
            result = {
              content: [
                {
                  type: "text",
                  text: `# Security Scan: ${contractName}\nRisk Score: ${analysis.riskScore}/100\nIssues: ${analysis.vulnerabilities.length}\n\n${analysis.summary}`,
                },
              ],
            };
          } else if (name === "reputation_check") {
            result = {
              content: [
                {
                  type: "text",
                  text: `# Reputation: ${args.address}\nStatus: Active\nRisk Level: Low`,
                },
              ],
            };
          } else {
            result = { content: [{ type: "text", text: `Unknown tool: ${name}` }] };
          }

          return new Response(
            JSON.stringify({ jsonrpc: "2.0", result, id: body.id }),
            { headers: { "Content-Type": "application/json" } }
          );
        }

        return new Response(JSON.stringify({ error: "Invalid request" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  console.log(`[ShieldPay MCP] Demo security scanner running on http://localhost:${PORT}`);
  console.log(`[ShieldPay MCP] MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`[ShieldPay MCP] Health check: http://localhost:${PORT}/health`);

  await server.connect(transport);
}

main().catch(console.error);
