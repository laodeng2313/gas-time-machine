# Gas Time Machine

**What did your Ethereum transaction cost—and what might cheaper gas have looked like?**

A TypeScript CLI comparing actual mainnet execution fees with a transparent cheaper-gas scenario. Also shows current suggested EIP-1559 fee caps. No wallet or paid API key required.

[中文说明](README.zh-CN.md) · [Static demo](web/index.html) · MIT licensed

## Try it in five minutes

Requires Node.js 20+ and npm.

```sh
git clone https://github.com/laodeng2313/gas-time-machine.git
cd gas-time-machine
npm ci
npm test
npm run build

# Simulation using current mainnet fees; requires RPC access
npx tsx src/cli.ts --gas-used 21000 --max-fee-gwei 100 --priority-fee-gwei 1 --eth-price-usd 3000

# Replace <txHash> with a confirmed Ethereum mainnet transaction hash
npx tsx src/cli.ts <txHash>
```

If the latest base fee exceeds your cap, raise `--max-fee-gwei`. Simulation estimates fees and never sends a transaction. Omit `--eth-price-usd` for ETH-only output. The supplied price applies equally to both scenarios; it is not historical pricing.

Other entry points:

```sh
npm start -- --help
npm run cli -- --help
node dist/cli.js --help
# Install this repository's CLI locally after building
npm link
gas-time-machine --help
```

Open `web/index.html` directly for an interactive offline sample. It uses labeled fixture data and makes no network calls.

## How the heuristic works

For a confirmed transaction, **actual execution fee = receipt gasUsed × effectiveGasPrice**, including reverted transactions. Simulation uses **min(maxFee, latest base fee + priority fee)**. A cap below the latest base fee is rejected. You supply gas used; this is not an EVM execution simulator.

The tool requests up to **100 blocks** of `eth_feeHistory`, ending at the transaction's block (or the latest observed block in simulation). Each sampled block's price is its base fee plus its gas-weighted median priority fee. Sort these prices and select the **nearest-rank 25th percentile**, index `ceil(n × 0.25) - 1`. The extra next-block base-fee prediction returned by RPC is excluded.

The scenario reuses the same gas used. Savings are `max(0, baseline fee − scenario fee)`. A more expensive scenario is explicitly identified. Fewer returned blocks are accepted and the actual sample count is shown; empty or incomplete history fails.

This is a **backward-looking proxy for waiting**, not evidence of a future cheaper block, a historical replay, or an inclusion guarantee. At typical mainnet block intervals, 100 blocks cover roughly 20 minutes; elapsed time varies. Contract state, gas usage, deadlines, and ETH price can change. Execution fees exclude transferred value and blob fees.

Current suggested max and priority caps come from viem's `estimateFeesPerGas`. Caps are not the amount charged. **Not financial advice.**

## RPC configuration

Default: `https://ethereum-rpc.publicnode.com`. Override with `RPC_URL`, then `ETH_RPC_URL` if `RPC_URL` is unset:

```sh
# macOS/Linux
RPC_URL=https://your-mainnet-rpc.example npm start -- <txHash>
```

```powershell
# PowerShell
$env:RPC_URL = 'https://your-mainnet-rpc.example'
npm start -- <txHash>
```

Only chain ID 1 is accepted. Public endpoints may rate limit; older history may require an archive-capable endpoint. Pending/unknown transactions have no receipt and cannot be analyzed. On errors, check flags, confirmation, RPC connectivity, and fee-history support. RPC calls have bounded timeouts and one retry. Keep endpoint credentials out of commits.

## Develop

```sh
npm ci
npm test       # entirely offline: pure functions and injected mock RPC
npm run build # strict TypeScript, declarations, and source maps in dist/
```

`src/core.ts` contains bigint calculations, `src/rpc.ts` adapts viem to the injectable `GasRpc` interface, and `src/cli.ts` validates input and formats results. Tests cover percentiles, fee caps, invalid inputs, chain checks, receipts, and simulations. The demo is standalone HTML/CSS/JS. Contributions welcome: include focused tests for behavior changes.
