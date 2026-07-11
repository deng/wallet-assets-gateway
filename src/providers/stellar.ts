import { AssetItem, AssetsResponseData } from '../index';
import { getChainInfo } from '../chains';

// ---------------------------------------------------------------------------
// Stellar Horizon API
// ---------------------------------------------------------------------------
const HORIZON_MAINNET = 'https://horizon.stellar.org';
const HORIZON_TESTNET = 'https://horizon-testnet.stellar.org';

/**
 * Fetch wallet assets from Stellar Horizon API for a given address.
 *
 * Returns native XLM balance + all non-native asset trustline balances.
 */
export async function fetchStellarAssets(
  address: string,
  caip2Chain: string,
): Promise<AssetsResponseData> {
  const chainInfo = getChainInfo(caip2Chain);
  if (!chainInfo) {
    throw new Error(`Unsupported chain: '${caip2Chain}'`);
  }

  const horizonUrl = chainInfo.testnet ? HORIZON_TESTNET : HORIZON_MAINNET;
  const res = await fetch(`${horizonUrl}/accounts/${encodeURIComponent(address)}`, {
    signal: AbortSignal.timeout(10_000),
  });

  // 404 = account not activated yet, return empty
  if (res.status === 404) {
    return { address, chain: caip2Chain, totalValueUsd: 0, assets: [] };
  }
  if (!res.ok) {
    throw new Error(`Horizon API error: ${res.status} ${res.statusText || 'Unknown'}`);
  }

  const data = await res.json() as Record<string, unknown>;
  const balances = (data.balances as Array<Record<string, unknown>>) ?? [];

  const assets: AssetItem[] = [];
  for (const b of balances) {
    const assetType = b.asset_type as string | undefined;
    const balance = parseFloat((b.balance as string) ?? '0');
    if (assetType == null) continue;

    if (assetType === 'native') {
      assets.push({
        coinId: 'native',
        symbol: 'XLM',
        name: 'Stellar',
        amount: balance,
        priceUsd: null,
        valueUsd: 0,
        change24h: null,
        decimals: 7,
        contractAddress: null,
        logoUrl: null,
      });
    } else {
      const code = (b.asset_code as string) ?? '';
      const issuer = (b.asset_issuer as string) ?? '';
      if (!code) continue;

      assets.push({
        coinId: `${code}-${issuer}`,
        symbol: code,
        name: code,
        amount: balance,
        priceUsd: null,
        valueUsd: 0,
        change24h: null,
        decimals: 7,
        contractAddress: `${code}-${issuer}`,
        logoUrl: null,
      });
    }
  }

  const totalValueUsd = assets.reduce((sum, a) => sum + a.valueUsd, 0);
  return { address, chain: caip2Chain, totalValueUsd, assets };
}

/** Check whether a chain is Stellar. */
export function isStellarChainSupported(caip2: string): boolean {
  if (!caip2.startsWith('stellar:')) return false;
  const info = getChainInfo(caip2);
  return info !== undefined;
}
