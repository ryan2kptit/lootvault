import { type Hex, type PublicClient, type TransactionReceipt, TransactionReceiptNotFoundError } from "viem";

export const CHAIN_READER = Symbol("CHAIN_READER");

export interface ChainReader {
  /** null while the transaction is not mined yet (or unknown). */
  getReceipt(txHash: Hex): Promise<TransactionReceipt | null>;
  /** Unix seconds. */
  getBlockTimestamp(blockNumber: bigint): Promise<number>;
  /** Current chain head. */
  getBlockNumber(): Promise<bigint>;
}

export class ViemChainReader implements ChainReader {
  constructor(private readonly client: PublicClient) {}

  async getReceipt(txHash: Hex): Promise<TransactionReceipt | null> {
    try {
      return await this.client.getTransactionReceipt({ hash: txHash });
    } catch (error) {
      if (error instanceof TransactionReceiptNotFoundError) return null;
      throw error;
    }
  }

  async getBlockTimestamp(blockNumber: bigint): Promise<number> {
    return Number((await this.client.getBlock({ blockNumber })).timestamp);
  }

  getBlockNumber(): Promise<bigint> {
    return this.client.getBlockNumber();
  }
}
