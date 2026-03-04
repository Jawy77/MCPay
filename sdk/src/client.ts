/**
 * ShieldPay SDK — Shield-aware MCP Client
 *
 * Wraps MCP tool calls with ShieldPay CRE verification.
 * Instead of calling MCP servers directly, this client routes through the
 * CRE workflow to ensure payment verification and service delivery attestation.
 */

import type { Address } from "viem";
import { AttestationReader } from "./attestation.js";
import { PolicyManager } from "./policies.js";

export interface ShieldPayConfig {
  /** ShieldVault contract address on Base Sepolia */
  vaultAddress: Address;
  /** CRE workflow HTTP trigger URL */
  creWorkflowUrl: string;
  /** Agent wallet address */
  agentAddress: Address;
  /** Base Sepolia RPC URL */
  rpcUrl?: string;
}

export interface McpToolCall {
  /** MCP server URL */
  mcpServerUrl: string;
  /** MCP server wallet address (payment recipient) */
  mcpServerAddress: Address;
  /** Name of the MCP tool to call */
  toolName: string;
  /** Arguments for the MCP tool */
  toolArgs: Record<string, unknown>;
  /** USDC amount to pay (human-readable, e.g. "0.05") */
  amount: string;
  /** x402 payment receipt (base64) */
  paymentReceipt: string;
}

export interface ShieldPayResult {
  success: boolean;
  qualityScore: number;
  attestationTx: string;
  serviceHash: string;
  paymentHash: string;
  mcpResponse: Array<{ type: string; text: string }>;
}

export class ShieldPayClient {
  private config: ShieldPayConfig;
  public attestations: AttestationReader;
  public policies: PolicyManager;

  constructor(config: ShieldPayConfig) {
    this.config = config;
    this.attestations = new AttestationReader(config.vaultAddress, config.rpcUrl);
    this.policies = new PolicyManager(config.vaultAddress, { rpcUrl: config.rpcUrl });
  }

  /**
   * Execute a verified MCP tool call through the CRE workflow.
   * This is the main entry point for agents.
   *
   * Flow: Pre-flight policy check → CRE workflow → Attestation
   */
  async callTool(call: McpToolCall): Promise<ShieldPayResult> {
    // 1. Local pre-flight: check spending policy before hitting CRE
    const policyCheck = await this.policies.checkPolicy(
      this.config.agentAddress,
      call.amount
    );

    if (!policyCheck.allowed) {
      throw new Error(`ShieldPay: payment blocked by policy — ${policyCheck.reason}`);
    }

    // 2. Check MCP server reputation
    const reputation = await this.attestations.getMcpReputation(call.mcpServerAddress);
    if (reputation.totalCalls > 0n && reputation.avgScore < 30n) {
      throw new Error(
        `ShieldPay: MCP server has low reputation (avg score: ${reputation.avgScore}, disputes: ${reputation.disputes})`
      );
    }

    // 3. Send to CRE workflow for verified execution
    const response = await fetch(this.config.creWorkflowUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentAddress: this.config.agentAddress,
        mcpServerAddress: call.mcpServerAddress,
        paymentReceipt: call.paymentReceipt,
        mcpToolName: call.toolName,
        mcpToolArgs: call.toolArgs,
        amountPaid: call.amount,
      }),
    });

    if (!response.ok) {
      throw new Error(`ShieldPay: CRE workflow returned ${response.status} — ${await response.text()}`);
    }

    const result: ShieldPayResult = await response.json();
    return result;
  }

  /**
   * Get verification status for a recent transaction by checking on-chain attestation.
   */
  async getLastVerification(): Promise<{
    qualityScore: number;
    disputed: boolean;
    amountPaid: string;
    timestamp: Date;
  } | null> {
    try {
      const attestation = await this.attestations.getLatestAttestation(
        this.config.agentAddress
      );
      return {
        qualityScore: attestation.qualityScore,
        disputed: attestation.disputed,
        amountPaid: (Number(attestation.amountPaid) / 1e6).toFixed(6),
        timestamp: new Date(Number(attestation.timestamp) * 1000),
      };
    } catch {
      return null;
    }
  }
}
