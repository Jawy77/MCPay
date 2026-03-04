/**
 * ShieldPay SDK — Spending Policy Management
 *
 * Allows agents to set and check spending policies on ShieldVault.sol.
 * Policies enforce per-call and daily spending limits for x402 micropayments.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Chain,
  type Account,
} from "viem";
import { baseSepolia } from "viem/chains";

const SHIELD_VAULT_ABI = [
  {
    name: "checkPolicy",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "_agent", type: "address" },
      { name: "_amount", type: "uint256" },
    ],
    outputs: [
      { name: "allowed", type: "bool" },
      { name: "reason", type: "string" },
    ],
  },
  {
    name: "setPolicy",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_maxPerCall", type: "uint256" },
      { name: "_maxDaily", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "spendingPolicies",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [
      { name: "maxPerCall", type: "uint256" },
      { name: "maxDaily", type: "uint256" },
      { name: "dailySpent", type: "uint256" },
      { name: "windowStart", type: "uint256" },
      { name: "isActive", type: "bool" },
    ],
  },
] as const;

export interface SpendingPolicy {
  maxPerCall: bigint;
  maxDaily: bigint;
  dailySpent: bigint;
  windowStart: bigint;
  isActive: boolean;
}

export interface PolicyCheckResult {
  allowed: boolean;
  reason: string;
}

/** Convert human-readable USDC (e.g. "0.05") to 6-decimal wei */
export function usdcToWei(amount: string): bigint {
  return BigInt(Math.floor(parseFloat(amount) * 1e6));
}

/** Convert 6-decimal USDC wei to human-readable string */
export function weiToUsdc(wei: bigint): string {
  return (Number(wei) / 1e6).toFixed(6);
}

export class PolicyManager {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private publicClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private walletClient: any;
  private vaultAddress: Address;

  constructor(
    vaultAddress: Address,
    options?: {
      rpcUrl?: string;
      chain?: Chain;
      account?: Account;
    }
  ) {
    this.vaultAddress = vaultAddress;
    const chain = options?.chain ?? baseSepolia;
    const transport = http(options?.rpcUrl ?? "https://sepolia.base.org");

    this.publicClient = createPublicClient({ chain, transport });

    this.walletClient = options?.account
      ? createWalletClient({ chain, transport, account: options.account })
      : null;
  }

  /** Check if a payment amount is within an agent's policy */
  async checkPolicy(agentAddress: Address, amountUsdc: string): Promise<PolicyCheckResult> {
    const [allowed, reason] = await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: SHIELD_VAULT_ABI,
      functionName: "checkPolicy",
      args: [agentAddress, usdcToWei(amountUsdc)],
    });

    return { allowed, reason };
  }

  /** Get the current spending policy for an agent */
  async getPolicy(agentAddress: Address): Promise<SpendingPolicy> {
    const result = await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: SHIELD_VAULT_ABI,
      functionName: "spendingPolicies",
      args: [agentAddress],
    });

    return {
      maxPerCall: result[0],
      maxDaily: result[1],
      dailySpent: result[2],
      windowStart: result[3],
      isActive: result[4],
    };
  }

  /** Set a spending policy for the connected wallet (agent) */
  async setPolicy(maxPerCallUsdc: string, maxDailyUsdc: string): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new Error("PolicyManager: wallet client required to set policy. Pass an account in constructor options.");
    }

    const hash = await this.walletClient.writeContract({
      address: this.vaultAddress,
      abi: SHIELD_VAULT_ABI,
      functionName: "setPolicy",
      args: [usdcToWei(maxPerCallUsdc), usdcToWei(maxDailyUsdc)],
    });

    return hash;
  }
}
