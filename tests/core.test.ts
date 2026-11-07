import { describe, expect, it, vi } from 'vitest';
import { compare, effectivePrice } from '../src/core.js';
import { run } from '../src/cli.js';
import type { GasRpc } from '../src/rpc.js';
const g = 1_000_000_000n;
const hash = `0x${'ab'.repeat(32)}`;
function mock(): GasRpc {
  return {
    chainId: vi.fn(async () => 1),
    receipt: vi.fn(async () => ({ gasUsed: 21000n, effectiveGasPrice: 20n * g, blockNumber: 500n, status: 'success' })),
    history: vi.fn(async () => [8n, 18n, 28n, 38n].map(n => ({ baseFee: n * g, tip: 2n * g }))),
    current: vi.fn(async () => ({ baseFee: 10n * g, maxFee: 25n * g, priorityFee: 2n * g, blockNumber: 600n })),
  };
}
describe('pure calculations', () => {
  it('uses nearest-rank quartile and exact bigint costs', () => {
    expect(compare(21000n, 20n * g, [40n, 10n, 30n, 20n].map(n => ({ baseFee: n * g, tip: 0n })))).toMatchObject({
      baselineWei: 420000000000000n, waitingWei: 210000000000000n, savingsPercent: 50,
    });
  });
  it('floors negative savings and handles free baseline', () => {
    expect(compare(1n, 0n, [{ baseFee: 10n, tip: 1n }])).toMatchObject({ savingsWei: 0n, savingsPercent: 0 });
  });
  it('rejects missing or invalid history', () => {
    expect(() => compare(1n, 1n, [])).toThrow('no fee history');
    expect(() => compare(1n, 1n, [{ baseFee: -1n, tip: 0n }])).toThrow();
    expect(() => compare(0n, 1n, [{ baseFee: 1n, tip: 0n }])).toThrow();
  });
  it('respects caps and rejects unmarketable simulations', () => {
    expect(effectivePrice(10n, 11n, 2n)).toBe(11n);
    expect(effectivePrice(10n, 30n, 2n)).toBe(12n);
    expect(() => effectivePrice(10n, 9n, 1n)).toThrow('below');
    expect(() => effectivePrice(10n, 11n, 12n)).toThrow();
  });
});
describe('CLI with injected RPC (no network)', () => {
  it('uses receipt price and transaction block history', async () => {
    const rpc = mock();
    const output = await run([hash, '--eth-price-usd', '3000'], rpc);
    expect(output).toContain('Actual execution fee: 0.00042 ETH (~$1.26)');
    expect(output).toContain('50.00%');
    expect(output).toContain('Not financial advice');
    expect(rpc.history).toHaveBeenCalledWith(500n);
  });
  it('simulates effective price rather than cap payment', async () => {
    const rpc = mock();
    expect(await run(['--gas-used', '21000', '--max-fee-gwei', '30', '--priority-fee-gwei', '2'], rpc)).toContain('Estimated baseline: 0.000252 ETH');
    expect(rpc.receipt).not.toHaveBeenCalled();
    expect(rpc.history).toHaveBeenCalledWith(600n);
  });
  it.each([
    ['bad'], [hash, hash], [hash, '--gas-used', '1'], ['--gas-used', '1'],
    ['--gas-used', '-1', '--max-fee-gwei', '2', '--priority-fee-gwei', '1'],
    ['--gas-used', '1', '--max-fee-gwei', '1', '--priority-fee-gwei', '2'],
    [hash, '--eth-price-usd', 'NaN'], [hash, '--unknown'],
  ])('rejects invalid input before network: %j', async (...args) => {
    const rpc = mock();
    await expect(run(args, rpc)).rejects.toThrow();
    expect(rpc.chainId).not.toHaveBeenCalled();
  });
  it('returns help without RPC', async () => {
    const rpc = mock();
    expect(await run(['--help'], rpc)).toContain('Usage:');
    expect(rpc.chainId).not.toHaveBeenCalled();
  });
  it('rejects non-mainnet and unavailable receipts', async () => {
    const rpc = mock();
    rpc.chainId = async () => 10;
    await expect(run([hash], rpc)).rejects.toThrow('mainnet');
    rpc.chainId = async () => 1;
    rpc.receipt = async () => { throw new Error('Transaction not found'); };
    await expect(run([hash], rpc)).rejects.toThrow('Transaction not found');
  });
});
