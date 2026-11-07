# Gas Time Machine 燃气费时光机

TypeScript 命令行工具：查看以太坊主网交易实际执行费，与较低 gas 情景作比较，并显示当前建议费用上限。无需钱包或付费 API 密钥。

需要 Node.js 20+：

```sh
npm ci
npm test
npm run build
npx tsx src/cli.ts --gas-used 21000 --max-fee-gwei 100 --priority-fee-gwei 1 --eth-price-usd 3000
npx tsx src/cli.ts <完整交易哈希>
```

模拟需要访问主网 RPC，但不会发送交易。默认使用公共 RPC，可通过 `RPC_URL` 或 `ETH_RPC_URL` 覆盖。测试完全离线。直接打开 `web/index.html` 可查看离线示例。

算法取截至交易区块（模拟则为当前区块）的最多 100 个区块，每块基础费加该块优先费中位数，再取第 25 百分位作为较低 gas 情景。实际费用使用回执中的 gasUsed × effectiveGasPrice；模拟使用 min(费用上限, 当前基础费 + 优先费)。节省金额最低为零。

这是向后看的启发式估计，不代表未来一定能等到更便宜的区块，也不保证成交。只计算执行费，不含转账金额或 blob 费。美元价格由用户提供，不是历史价格。**不构成财务建议。** 详细算法与限制见 [English README](README.md)。MIT 开源。
