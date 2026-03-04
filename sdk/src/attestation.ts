/**
 * ShieldPay SDK — On-chain attestation reader
 *
 * Reads attestation data from ShieldVault.sol on Base Sepolia.
 * Used by agents and dashboards to verify past transactions and check MCP reputation.
 */

import {
  createPublicClient,
  http,
  type Address,
  type Chain,
} from "viem";
import { baseSepolia } from "viem/chains";

// ShieldVault ABI (read functions only)
const SHIELD_VAULT_ABI = [
  {
    name: "attestations",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "paymentHash", type: "bytes32" },
      { name: "serviceHash", type: "bytes32" },
      { name: "qualityScore", type: "uint8" },
      { name: "mcpServer", type: "address" },
      { name: "agent", type: "address" },
      { name: "amountPaid", type: "uint256" },
      { name: "timestamp", type: "uint256" },
      { name: "disputed", type: "bool" },
    ],
  },
  {
    name: "attestationCount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getLatestAttestation",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_agent", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "paymentHash", type: "bytes32" },
          { name: "serviceHash", type: "bytes32" },
          { name: "qualityScore", type: "uint8" },
          { name: "mcpServer", type: "address" },
          { name: "agent", type: "address" },
          { name: "amountPaid", type: "uint256" },
          { name: "timestamp", type: "uint256" },
          { name: "disputed", type: "bool" },
        ],
      },
    ],
  },
  {
    name: "getMcpReputation",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_mcpServer", type: "address" }],
    outputs: [
      { name: "avgScore", type: "uint256" },
      { name: "totalCalls", type: "uint256" },
      { name: "disputes", type: "uint256" },
    ],
  },
  {
    name: "getAgentAttestationCount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_agent", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export interface Attestation {
  paymentHash: `0x${string}`;
  serviceHash: `0x${string}`;
  qualityScore: number;
  mcpServer: Address;
  agent: Address;
  amountPaid: bigint;
  timestamp: bigint;
  disputed: boolean;
}

export interface McpReputation {
  avgScore: bigint;
  totalCalls: bigint;
  disputes: bigint;
}

export class AttestationReader {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;
  private vaultAddress: Address;

  constructor(vaultAddress: Address, rpcUrl?: string, chain?: Chain) {
    this.vaultAddress = vaultAddress;
    this.client = createPublicClient({
      chain: chain ?? baseSepolia,
      transport: http(rpcUrl ?? "https://sepolia.base.org"),
    });
  }

  /** Get attestation by ID */
  async getAttestation(id: bigint): Promise<Attestation> {
    const result = await this.client.readContract({
      address: this.vaultAddress,
      abi: SHIELD_VAULT_ABI,
      functionName: "attestations",
      args: [id],
    });

    return {
      paymentHash: result[0],
      serviceHash: result[1],
      qualityScore: result[2],
      mcpServer: result[3],
      agent: result[4],
      amountPaid: result[5],
      timestamp: result[6],
      disputed: result[7],
    };
  }

  /** Get total attestation count */
  async getAttestationCount(): Promise<bigint> {
    return this.client.readContract({
      address: this.vaultAddress,
      abi: SHIELD_VAULT_ABI,
      functionName: "attestationCount",
    });
  }

  /** Get the latest attestation for a given agent */
  async getLatestAttestation(agentAddress: Address): Promise<Attestation> {
    const result = await this.client.readContract({
      address: this.vaultAddress,
      abi: SHIELD_VAULT_ABI,
      functionName: "getLatestAttestation",
      args: [agentAddress],
    });

    return result as unknown as Attestation;
  }

  /** Get MCP server reputation stats */
  async getMcpReputation(mcpServerAddress: Address): Promise<McpReputation> {
    const [avgScore, totalCalls, disputes] = await this.client.readContract({
      address: this.vaultAddress,
      abi: SHIELD_VAULT_ABI,
      functionName: "getMcpReputation",
      args: [mcpServerAddress],
    });

    return { avgScore, totalCalls, disputes };
  }

  /** Get attestation count for an agent */
  async getAgentAttestationCount(agentAddress: Address): Promise<bigint> {
    return this.client.readContract({
      address: this.vaultAddress,
      abi: SHIELD_VAULT_ABI,
      functionName: "getAgentAttestationCount",
      args: [agentAddress],
    });
  }
}
