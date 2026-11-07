#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { formatEther, formatGwei, parseGwei, type Hash } from 'viem';
import { compare, effectivePrice } from './core.js';
import { createRpc, type GasRpc } from './rpc.js';

export const help = `Gas Time Machine — Ethereum mainnet
Usage:
  gas-time-machine <txHash> [--eth-price-usd 3000]
  gas-time-machine --gas-used 21000 --max-fee-gwei 30 --priority-fee-gwei 1

Options: --eth-price-usd <positive price>  --help
RPC: RPC_URL, then ETH_RPC_URL, then public Ethereum RPC (no API key).
Simulation reads live fees; no transaction is sent. Not financial advice.`;

function fee(value: string | undefined, label: string): bigint {
  if (!value || !/^\d+(\.\d{1,9})?$/.test(value)) throw new Error(`${label} must be a nonnegative decimal with at most 9 decimal places`);
  return parseGwei(value);
}

export async function run(args: string[], rpc: GasRpc = createRpc()): Promise<string> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    'gas-used': { type: 'string' }, 'max-fee-gwei': { type: 'string' },
    'priority-fee-gwei': { type: 'string' }, 'eth-price-usd': { type: 'string' }, help: { type: 'boolean' },
  } });
  if (values.help || args.length === 0) return help;
  const simulation = ['gas-used', 'max-fee-gwei', 'priority-fee-gwei'].some(k => values[k as keyof typeof values] !== undefined);
  if (positionals.length > 1 || (simulation && positionals.length)) throw new Error('Choose one transaction hash OR simulation flags');
  const usd = values['eth-price-usd'] === undefined ? undefined : Number(values['eth-price-usd']);
  if (usd !== undefined && (!Number.isFinite(usd) || usd <= 0)) throw new Error('ETH price must be a positive finite number');
  let gasUsed: bigint = 0n, price = 0n;
  let maxFee = 0n, tip = 0n;
  if (simulation) {
    if (!/^[1-9]\d*$/.test(values['gas-used'] ?? '')) throw new Error('--gas-used must be a positive integer');
    gasUsed = BigInt(values['gas-used']!);
    maxFee = fee(values['max-fee-gwei'], '--max-fee-gwei');
    tip = fee(values['priority-fee-gwei'], '--priority-fee-gwei');
    if (tip > maxFee) throw new Error('Priority fee must not exceed max fee');
  } else if (!/^0x[0-9a-fA-F]{64}$/.test(positionals[0] ?? '')) throw new Error('Provide a 32-byte transaction hash or all three simulation flags');
  if (await rpc.chainId() !== 1) throw new Error('RPC must connect to Ethereum mainnet (chain ID 1)');
  const current = await rpc.current();
  let end: bigint | undefined, status = '';
  if (simulation) price = effectivePrice(current.baseFee, maxFee, tip);
  else {
    const receipt = await rpc.receipt(positionals[0] as Hash);
    gasUsed = receipt.gasUsed; price = receipt.effectiveGasPrice; end = receipt.blockNumber;
    status = `Receipt status: ${receipt.status}\n`;
  }
  const result = compare(gasUsed, price, await rpc.history(end ?? current.blockNumber));
  const cost = (wei: bigint) => `${formatEther(wei)} ETH${usd === undefined ? '' : ` (~$${(Number(formatEther(wei)) * usd).toFixed(2)})`}`;
  return [
    'GAS TIME MACHINE | Ethereum mainnet',
    simulation ? 'Simulation — estimated execution fee at latest base fee' : `Transaction: ${positionals[0]}`,
    status.trim(), `Gas used: ${gasUsed}`, `${simulation ? 'Estimated baseline' : 'Actual execution fee'}: ${cost(result.baselineWei)} (${formatGwei(price)} gwei/gas)`,
    `Cheaper-gas scenario: ${cost(result.waitingWei)} (${formatGwei(result.cheaperGasPrice)} gwei/gas)`,
    `Potential savings: ${cost(result.savingsWei)} (${result.savingsPercent.toFixed(2)}%)`,
    `Heuristic: 25th percentile of ${result.sampleCount} block base-fee + median-tip samples ending at block ${end ?? current.blockNumber}.`,
    'This backward-looking window is a proxy for waiting, not a future price or inclusion guarantee.',
    ...(result.waitingWei > result.baselineWei ? ['Sampled scenario is more expensive than baseline; savings floored at zero.'] : []),
    `Current suggested caps (block ${current.blockNumber}): max fee ${formatGwei(current.maxFee)} gwei; priority ${formatGwei(current.priorityFee)} gwei.`,
    'Caps are not the amount charged. Execution fees only; excludes blob fees and transferred value.',
    ...(usd === undefined ? [] : [`USD uses your supplied ETH price ($${usd}); not a historical price.`]),
    'Not financial advice.',
  ].filter(Boolean).join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2)).then(output => console.log(output)).catch(() => {
    console.error('Error: could not analyze input or fetch mainnet data. Check flags (--help), transaction confirmation, and RPC_URL / ETH_RPC_URL.');
    process.exitCode = 1;
  });
}
