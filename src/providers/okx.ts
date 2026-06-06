import { Env, AssetItem, AssetsResponseData } from '../index';
import { getChainInfo } from '../chains';

// ---------------------------------------------------------------------------
// OKX Wallet API types
// ---------------------------------------------------------------------------
interface OkxTokenAsset {
  chainIndex: string;
  tokenAddress: string;
  symbol: string;
  balance: string;
  tokenPrice: string;
  tokenType?: string;
  isRiskToken?: boolean;
}

interface OkxChainData {
  chainIndex: string;
  tokenAssets: OkxTokenAsset[];
}

interface OkxResponse {
  code: string;
  msg?: string;
  data?: OkxChainData[];
}

// ---------------------------------------------------------------------------
// HMAC-SHA256 signing
// ---------------------------------------------------------------------------
async function signAsync(
  secretKey: string,
  timestamp: string,
  method: string,
  requestPath: string,
  body?: string,
): Promise<string> {
  const message = timestamp + method + requestPath + (body ?? '');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// ---------------------------------------------------------------------------
// OKX Wallet API: All Token Balances by Address
// ---------------------------------------------------------------------------
export async function fetchOkxAssets(
  env: Env,
  address: string,
  caip2Chain: string,
): Promise<AssetsResponseData> {
  const chainInfo = getChainInfo(caip2Chain);
  if (!chainInfo) {
    throw new Error(`Unsupported chain: '${caip2Chain}'`);
  }
  if (!chainInfo.okxChainIndex) {
    throw new Error(`OKX: chain '${caip2Chain}' is not supported`);
  }

  const requestPath = `/api/v5/wallet/asset/all-token-balances-by-address?address=${encodeURIComponent(address)}&chains=${chainInfo.okxChainIndex}&filter=1`;

  // Sign
  const timestamp = new Date().toISOString();
  const signature = await signAsync(
    env.OKX_SECRET_KEY,
    timestamp,
    'GET',
    requestPath,
  );

  const url = `${env.OKX_BASE_URL}${requestPath}`;
  const res = await fetch(url, {
    headers: {
      'OK-ACCESS-KEY': env.OKX_API_KEY,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': env.OKX_API_PASSPHRASE,
      'OK-ACCESS-PROJECT': env.OKX_PROJECT_ID,
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OKX API error: ${res.status} ${body}`);
  }

  const json = (await res.json()) as OkxResponse;

  if (json.code !== '0') {
    throw new Error(`OKX API error: code=${json.code} msg=${json.msg ?? 'Unknown'}`);
  }

  const allTokenAssets = (json.data ?? []).flatMap((chain) => chain.tokenAssets ?? []);
  const assets = allTokenAssets.map((item): AssetItem => {
    const amount = parseFloat(item.balance || '0');
    const priceUsd = parseFloat(item.tokenPrice || '0');
    return {
      coinId: item.tokenAddress || null,
      symbol: item.symbol || '',
      name: null,
      amount,
      priceUsd: priceUsd || null,
      valueUsd: amount * priceUsd,
      change24h: null,
      decimals: null,
      contractAddress: item.tokenAddress || null,
      logoUrl: null,
    };
  });

  const totalValueUsd = assets.reduce((sum, a) => sum + a.valueUsd, 0);

  return {
    address,
    chain: caip2Chain,
    totalValueUsd,
    assets,
  };
}

/** Check whether a chain is supported by the OKX provider */
export function isOkxChainSupported(caip2: string): boolean {
  const info = getChainInfo(caip2);
  return info !== undefined && info.okxChainIndex !== undefined;
}
