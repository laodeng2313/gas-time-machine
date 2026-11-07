import { createPublicClient, http, type Hash } from 'viem';
import { mainnet } from 'viem/chains';
import type { Sample } from './core.js';

export interface GasRpc {
  chainId(): Promise<number>;
  receipt(hash: Hash): Promise<{ gasUsed: bigint; effectiveGasPrice: bigint; blockNumber: bigint; status: string }>;
  history(end?: bigint): Promise<Sample[]>;
  current(): Promise<{ baseFee: bigint; maxFee: bigint; priorityFee: bigint; blockNumber: bigint }>;
}

export function createRpc(url = process.env.RPC_URL || process.env.ETH_RPC_URL || 'https://ethereum-rpc.publicnode.com'): GasRpc {
  const client = createPublicClient({ chain: mainnet, transport: http(url, { timeout: 15_000, retryCount: 1 }) });
  return {
    chainId: () => client.getChainId(),
    receipt: hash => client.getTransactionReceipt({ hash }),
    async history(end) {
      const h = await client.getFeeHistory({ blockCount: 100, blockNumber: end, rewardPercentiles: [50] });
      if (!h.reward || h.reward.length !== h.gasUsedRatio.length || h.baseFeePerGas.length !== h.reward.length + 1)
        throw new Error('Incomplete RPC fee history');
      return h.reward.map((row, i) => {
        if (row[0] === undefined) throw new Error('Missing RPC priority fee sample');
        return { baseFee: h.baseFeePerGas[i], tip: row[0] };
      });
    },
    async current() {
      const block = await client.getBlock();
      const fees = await client.estimateFeesPerGas();
      if (block.baseFeePerGas === null) throw new Error('RPC does not provide mainnet base fees');
      return { baseFee: block.baseFeePerGas, maxFee: fees.maxFeePerGas,
        priorityFee: fees.maxPriorityFeePerGas, blockNumber: block.number };
    },
  };
}
