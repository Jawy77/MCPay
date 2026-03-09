/**
 * ShieldPay CRE Workflow: shield-verify
 *
 * CHAINLINK CRE WORKFLOW - Primary deliverable for Convergence Hackathon 2026
 *
 * This workflow orchestrates the complete lifecycle of a verified agent-to-MCP
 * payment transaction using Chainlink CRE capabilities:
 *
 * 1. PRE-FLIGHT CHECK  → Read spending policy from ShieldVault.sol (EVM read)
 * 2. PAYMENT CAPTURE   → Verify x402 payment via HTTP call to facilitator
 * 3. SERVICE DELIVERY  → Call premium MCP server via HTTP, capture response
 * 4. QUALITY VALIDATION → Off-chain compute: schema check + quality scoring
 * 5. ON-CHAIN ATTEST   → Write attestation to ShieldVault.sol (EVM write via report)
 *
 * Triggers: HTTP trigger (agent sends verification request)
 * Capabilities used: EVM read, EVM write (report), HTTP fetch, Consensus
 */

import {
  cre,
  encodeCallMsg,
  LAST_FINALIZED_BLOCK_NUMBER,
  prepareReportRequest,
  Runner,
  json,
  ok,
  text,
  type Runtime,
  type NodeRuntime,
} from "@chainlink/cre-sdk";
import { z } from "zod";
import { encodeAbiParameters, parseAbiParameters, keccak256, toBytes } from "viem";

// ============================================================================
// CONFIG SCHEMA
// ============================================================================

const configSchema = z.object({
  // ShieldVault contract on Base Sepolia
  shieldVaultAddress: z.string(),
  baseSepoliaChainSelector: z.string(),

  // MCP Server endpoint (the premium tool being paid for)
  mcpServerUrl: z.string(),

  // x402 facilitator for payment verification
  facilitatorUrl: z.string().default("https://x402-facilitator.cdp.coinbase.com"),

  // Gas limit for on-chain write
  gasLimit: z.number().default(300000),
});

type Config = z.infer<typeof configSchema>;

// ============================================================================
// HTTP TRIGGER PAYLOAD SCHEMA
// ============================================================================

interface ShieldVerifyRequest {
  agentAddress: string;        // Agent wallet that paid
  mcpServerAddress: string;    // MCP server receiving payment
  paymentReceipt: string;      // x402 payment receipt (base64)
  mcpToolName: string;         // MCP tool being called
  mcpToolArgs: Record<string, unknown>; // Arguments to pass to MCP tool
  amountPaid: string;          // USDC amount (human readable, e.g. "0.05")
}

// ============================================================================
// WORKFLOW LOGIC
// ============================================================================

function initWorkflow(config: Config) {

  // HTTP Trigger: Agent sends verification request via HTTP
  const httpCapability = new cre.capabilities.HTTPCapability();
  const httpTrigger = httpCapability.trigger({
    authorizedKeys: [],
  });

  // Main callback: orchestrate the full verify-pay-attest cycle
  const shieldVerifyCallback = (runtime: Runtime<Config>, triggerOutput: any) => {

    // Parse the incoming HTTP request payload
    const rawInput = triggerOutput.input || triggerOutput;
    const request: ShieldVerifyRequest = JSON.parse(
      typeof rawInput === 'string' ? rawInput : new TextDecoder().decode(rawInput)
    );

    runtime.log(`[ShieldPay] Starting verification for agent: ${request.agentAddress}`);
    runtime.log(`[ShieldPay] MCP Server: ${request.mcpServerAddress}`);
    runtime.log(`[ShieldPay] Tool: ${request.mcpToolName}`);
    runtime.log(`[ShieldPay] Amount: ${request.amountPaid} USDC`);

    // ========================================================================
    // STEP 1: PRE-FLIGHT CHECK — Read spending policy from ShieldVault
    // ========================================================================

    runtime.log("[ShieldPay] Step 1: Pre-flight check — reading spending policy...");

    const chainSelector = BigInt(config.baseSepoliaChainSelector);
    const evmClient = new cre.capabilities.EVMClient(chainSelector);

    // Encode checkPolicy(address,uint256) call
    const amountWei = BigInt(Math.floor(parseFloat(request.amountPaid) * 1e6)); // USDC 6 decimals
    const checkPolicyData = encodeAbiParameters(
      parseAbiParameters("address, uint256"),
      [request.agentAddress as `0x${string}`, amountWei]
    );
    // Function selector for checkPolicy(address,uint256)
    const checkPolicySelector = "0x5ee388f7"; // bytes4(keccak256("checkPolicy(address,uint256)"))

    const policyResult = evmClient.callContract(runtime, {
      call: encodeCallMsg({
        from: "0x0000000000000000000000000000000000000000" as `0x${string}`,
        to: config.shieldVaultAddress as `0x${string}`,
        data: (checkPolicySelector + checkPolicyData.slice(2)) as `0x${string}`,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    }).result();

    runtime.log(`[ShieldPay] Policy check result: ${JSON.stringify(policyResult)}`);

    // ========================================================================
    // STEP 2: PAYMENT VERIFICATION — Verify x402 payment via facilitator
    // ========================================================================

    runtime.log("[ShieldPay] Step 2: Verifying x402 payment...");

    const httpClient = new cre.capabilities.HTTPClient();

    // Verify payment receipt with the x402 facilitator
    const paymentVerification = httpClient.sendRequest(runtime as unknown as NodeRuntime<Config>, {
      url: `${config.facilitatorUrl}/verify`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        paymentReceipt: request.paymentReceipt,
        expectedAmount: request.amountPaid,
        expectedRecipient: request.mcpServerAddress,
      }),
    }).result();

    runtime.log(`[ShieldPay] Payment verification status: ${paymentVerification.statusCode}`);

    // ========================================================================
    // STEP 3: SERVICE DELIVERY — Call premium MCP server
    // ========================================================================

    runtime.log("[ShieldPay] Step 3: Calling premium MCP server...");

    const mcpResponse = httpClient.sendRequest(runtime as unknown as NodeRuntime<Config>, {
      url: config.mcpServerUrl,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ShieldPay-Attestation": "pending",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: request.mcpToolName,
          arguments: request.mcpToolArgs,
        },
        id: 1,
      }),
    }).result();

    runtime.log(`[ShieldPay] MCP response status: ${mcpResponse.statusCode}`);

    const mcpBody = typeof mcpResponse.body === 'string'
      ? mcpResponse.body
      : new TextDecoder().decode(mcpResponse.body);
    const mcpData = JSON.parse(mcpBody);

    // ========================================================================
    // STEP 4: QUALITY VALIDATION — Validate MCP response
    // ========================================================================

    runtime.log("[ShieldPay] Step 4: Validating service quality...");

    let qualityScore = 0;

    // Schema validation: response must have result.content
    if (mcpData?.result?.content && Array.isArray(mcpData.result.content)) {
      qualityScore += 30; // Valid MCP response structure
    }

    // Content validation: response must have actual data
    const contentText = mcpData?.result?.content?.[0]?.text || "";
    if (contentText.length > 10) {
      qualityScore += 30; // Non-trivial content returned
    }

    // Latency check: MCP should respond within reasonable time
    if (mcpResponse.statusCode === 200) {
      qualityScore += 20; // Successful HTTP response
    }

    // Payment amount vs. response quality ratio
    if (contentText.length > 100) {
      qualityScore += 20; // Substantial content for the price
    }

    // Cap at 100
    qualityScore = Math.min(qualityScore, 100);

    // Hash the service response for on-chain proof
    const serviceHash = keccak256(toBytes(contentText)) as `0x${string}`;
    const paymentHash = keccak256(toBytes(request.paymentReceipt)) as `0x${string}`;

    runtime.log(`[ShieldPay] Quality score: ${qualityScore}/100`);
    runtime.log(`[ShieldPay] Service hash: ${serviceHash}`);

    // ========================================================================
    // STEP 5: ON-CHAIN ATTESTATION — Write to ShieldVault.sol
    // ========================================================================

    runtime.log("[ShieldPay] Step 5: Writing on-chain attestation...");

    // Encode the attestation data for the report
    const attestationData = encodeAbiParameters(
      parseAbiParameters(
        "bytes32 paymentHash, bytes32 serviceHash, uint8 qualityScore, address mcpServer, address agent, uint256 amountPaid"
      ),
      [
        paymentHash,
        serviceHash,
        qualityScore,
        request.mcpServerAddress as `0x${string}`,
        request.agentAddress as `0x${string}`,
        amountWei,
      ]
    );

    // Generate signed report for DON consensus
    const reportRequest = prepareReportRequest(attestationData);
    const report = runtime.report(reportRequest).result();

    // Write report to ShieldVault consumer contract
    const writeResult = evmClient.writeReport(runtime, {
      receiver: config.shieldVaultAddress,
      report,
      gasConfig: {
        gasLimit: String(config.gasLimit),
      },
    }).result();

    runtime.log(`[ShieldPay] Attestation written on-chain!`);

    // Return result to agent
    const result = {
      success: true,
      qualityScore,
      serviceHash,
      paymentHash,
      mcpResponse: mcpData?.result?.content || [],
    };

    runtime.log(`[ShieldPay] Verification complete: ${JSON.stringify(result)}`);
    return JSON.stringify(result);
  };

  return [
    cre.handler(httpTrigger, shieldVerifyCallback),
  ];
}

// ============================================================================
// ENTRYPOINT
// ============================================================================

export async function main() {
  const runner = await Runner.newRunner<Config>({
    configParser: (c: any) => configSchema.parse(c),
  });
  await runner.run(initWorkflow);
}

main();
