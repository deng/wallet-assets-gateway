# wallet-assets Gateway

Cloudflare Worker 代理，查询钱包地址在各链上的资产余额。

## 数据源

| 链 | 主数据源 | Fallback |
|----|---------|----------|
| EVM 链 (ETH/BSC/Polygon/Base 等) | CoinStats | OKX DEX API |
| Solana | CoinStats | OKX DEX API |
| TRON | CoinStats | TRON Grid API |
| Bitcoin/Litecoin/Dogecoin/Bitcoin Cash | CoinStats | ❌ |
| Sui / Aptos / TON | CoinStats | ❌ |
| **Stellar (XLM)** | CoinStats | **Horizon API** |

## 端点

### `POST /api/v1/assets`

查询地址的资产余额。

```json
{
  "address": "0x...",
  "chain": "eip155:1",
  "provider": "auto"
}
```

`provider` 可选值：`auto`（默认）, `okx`, `tron`, `stellar`。

### `GET /api/v1/chains`

列出所有支持的链。

### `GET /health`

健康检查。

## Provider 架构

```
POST /api/v1/assets
  → provider=auto
    → CoinStats (primary)
      → 成功？返回
      → 失败？
        ├── EVM链 → OKX fallback
        ├── TRON  → TRON Grid fallback
        └── Stellar → Horizon API fallback
  → provider=okx     → OKX DEX API only
  → provider=tron    → TRON Grid API only
  → provider=stellar → Horizon API only
```

## Provider 实现

| Provider | 文件 | API |
|----------|------|-----|
| OKX | `src/providers/okx.ts` | OKX Wallet API (HMAC-SHA256) |
| TRON | `src/providers/tron.ts` | TRON Grid API + 内置 TRC20 代币列表 |
| Stellar | `src/providers/stellar.ts` | Stellar Horizon API |

## 添加新链

1. 在 `@zero-wallet/chain-utils` 的 `CHAIN_REGISTRY` 中添加链条目
2. 如果是已有数据源（OKX/TRON/Stellar）支持，更新对应的 `isXxxChainSupported` 函数
3. 如果是新数据源，新建 `src/providers/xxx.ts`，在 `src/index.ts` 中注册路由和 fallback
4. 在 `test/` 中添加测试用例
5. 运行 `npm test && npm run deploy`

## 本地开发

```bash
npm run dev       # Wrangler dev server on :8787
npm test          # Vitest
npm run typecheck # tsc --noEmit
npm run deploy    # 部署到 Cloudflare Workers
```

## 环境变量

| 变量 | 类型 | 说明 |
|------|------|------|
| `COINSTATS_BASE_URL` | wrangler.toml | CoinStats API 地址 |
| `COINSTATS_API_KEY` | secret | CoinStats API Key |
| `ASSETS_CACHE_TTL` | wrangler.toml | 缓存 TTL（秒，默认 30） |
| `OKX_BASE_URL` | wrangler.toml | OKX API 地址 |
| `OKX_API_KEY` | secret | OKX API Key |
| `OKX_SECRET_KEY` | secret | OKX Secret Key |
| `OKX_API_PASSPHRASE` | secret | OKX Passphrase |
| `OKX_PROJECT_ID` | secret | OKX Project ID |

## 生成 Flutter SDK

```bash
npm run generate-sdk
```

SDK 输出到 `wallet-assets-gateway-flutter/`，在 `wallet/pubspec.yaml` 中引用：

```yaml
dependencies:
  wallet_assets_gateway:
    path: ../gateway/wallet-assets/wallet-assets-gateway-flutter
```

## 相关仓库

- `deng/wallet` — 客户端钱包
- `deng/chain-utils` — 链注册表（CAIP-2 映射、数据源支持判断）
- `deng/wallet-assets-gateway` — 本服务
