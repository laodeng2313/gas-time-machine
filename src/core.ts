export interface Sample { baseFee: bigint; tip: bigint }
export interface Comparison {
  baselineWei: bigint; waitingWei: bigint; savingsWei: bigint;
  cheaperGasPrice: bigint; savingsPercent: number; sampleCount: number;
}

/** Nearest-rank 25th percentile of sampled base fee + median priority fee. */
export function compare(gasUsed: bigint, baselinePrice: bigint, samples: Sample[]): Comparison {
  if (gasUsed <= 0n || baselinePrice < 0n) throw new Error('Invalid gas used or baseline price');
  if (!samples.length) throw new Error('RPC returned no fee history samples');
  if (samples.some(s => s.baseFee < 0n || s.tip < 0n)) throw new Error('Negative fee history value');
  const prices = samples.map(s => s.baseFee + s.tip).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const cheaperGasPrice = prices[Math.ceil(prices.length * 0.25) - 1];
  const baselineWei = gasUsed * baselinePrice;
  const waitingWei = gasUsed * cheaperGasPrice;
  const savingsWei = baselineWei > waitingWei ? baselineWei - waitingWei : 0n;
  return { baselineWei, waitingWei, savingsWei, cheaperGasPrice,
    savingsPercent: baselineWei === 0n ? 0 : Number(savingsWei * 10000n / baselineWei) / 100,
    sampleCount: samples.length };
}

export function effectivePrice(baseFee: bigint, maxFee: bigint, priorityFee: bigint): bigint {
  if (baseFee < 0n || maxFee < 0n || priorityFee < 0n || priorityFee > maxFee)
    throw new Error('Fees must be nonnegative and priority fee must not exceed max fee');
  if (maxFee < baseFee) throw new Error('Max fee is below the latest base fee; simulation cannot be included at this base fee');
  return maxFee < baseFee + priorityFee ? maxFee : baseFee + priorityFee;
}
