import type { Address, Log, PublicClient } from "viem";

export const CHAIN_SOURCE = Symbol("CHAIN_SOURCE");

export interface ChainSource {
  getHead(): Promise<bigint>;
  /** All logs emitted by the LootVault contract in [fromBlock, toBlock]. */
  getLogs(fromBlock: bigint, toBlock: bigint): Promise<Log[]>;
  /** Unix seconds. */
  getBlockTimestamp(blockNumber: bigint): Promise<number>;
}

export class ViemChainSource implements ChainSource {
  constructor(
    private readonly client: PublicClient,
    private readonly contract: Address,
  ) {}

  getHead(): Promise<bigint> {
    return this.client.getBlockNumber({ cacheTime: 0 });
  }

  getLogs(fromBlock: bigint, toBlock: bigint): Promise<Log[]> {
    return this.client.getLogs({ address: this.contract, fromBlock, toBlock });
  }

  async getBlockTimestamp(blockNumber: bigint): Promise<number> {
    return Number((await this.client.getBlock({ blockNumber })).timestamp);
  }
}
