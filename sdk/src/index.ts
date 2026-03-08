/**
 * MCPay SDK — Lightweight client for the MCPay backend API.
 *
 * Usage:
 *   const mcpay = new MCPayClient('http://localhost:4000');
 *   const store = await mcpay.getStore();
 *   const result = await mcpay.buy('scan-contract', { address: '0x...' });
 */

export interface Tool {
  name: string;
  description: string;
  price: string;
  category: string;
  attestations: number;
}

export interface BuyResult {
  success: boolean;
  tool: string;
  amountPaid: string;
  qualityScore: number;
  paymentTx: string;
  attestationTx: string;
  mcpResponse: any;
}

export interface WalletInfo {
  address: string;
  usdcBalance: string;
  ethBalance: string;
  dailySpent: string;
  dailyLimit: string;
}

export interface Attestation {
  id: number;
  tool: string;
  amount: string;
  quality: number;
  status: string;
  timestamp: string;
}

export class MCPayClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:4000') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async getStore(): Promise<Tool[]> {
    const res = await fetch(`${this.baseUrl}/api/store`);
    const data = await res.json();
    return data.tools;
  }

  async buy(tool: string, args: Record<string, unknown> = {}, agentAddress?: string): Promise<BuyResult> {
    const body: any = { tool, args };
    if (agentAddress) body.agentAddress = agentAddress;

    const res = await fetch(`${this.baseUrl}/api/buy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `MCPay API error: ${res.status}`);
    }

    return res.json();
  }

  async getWallet(address: string): Promise<WalletInfo> {
    const res = await fetch(`${this.baseUrl}/api/wallet/${address}`);
    return res.json();
  }

  async getAttestations(address: string): Promise<Attestation[]> {
    const res = await fetch(`${this.baseUrl}/api/attestations/${address}`);
    const data = await res.json();
    return data.attestations;
  }

  async health(): Promise<{ status: string }> {
    const res = await fetch(`${this.baseUrl}/api/health`);
    return res.json();
  }
}

export default MCPayClient;
