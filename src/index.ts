import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { swaggerUI } from '@hono/swagger-ui';
import { getChainInfo, getAllChains } from './chains';
import { openApiSpec } from './openapi';
import { fetchOkxAssets, isOkxChainSupported } from './providers/okx';
import { fetchTronAssets, isTronChainSupported } from './providers/tron';
import { fetchStellarAssets, isStellarChainSupported } from './providers/stellar';

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------
export interface Env {
  COINSTATS_BASE_URL: string;
  ASSETS_CACHE_TTL: string;
  COINSTATS_API_KEY: string;
  OKX_BASE_URL: string;
  OKX_API_KEY: string;
  OKX_SECRET_KEY: string;
  OKX_API_PASSPHRASE: string;
  OKX_PROJECT_ID: string;
}

export interface AssetItem {
  coinId: string | null;
  symbol: string;
  name: string | null;
  amount: number;
  priceUsd: number | null;
  valueUsd: number;
  change24h: number | null;
  decimals: number | null;
  contractAddress: string | null;
  logoUrl: string | null;
}

export interface AssetsResponseData {
  address: string;
  chain: string;
  totalValueUsd: number;
  assets: AssetItem[];
}

export interface AssetsResponse {
  success: boolean;
  data?: AssetsResponseData;
  error?: string;
}

export interface ChainsResponse {
  success: boolean;
  data: Array<{ chain: string; name: string; nativeCurrency: string }>;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  version: string;
}

// ---------------------------------------------------------------------------
// CoinStats API types (internal)
// ---------------------------------------------------------------------------
interface CoinStatsItem {
  coinId: string;
  amount: number;
  decimals?: number;
  contractAddress?: string;
  chain: string;
  name: string;
  symbol: string;
  price: number;
  priceBtc?: number;
  imgUrl?: string;
  pCh24h?: number;
  rank?: number;
  volume?: number;
  connectionId: string;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------
interface CacheEntry {
  data: AssetsResponseData;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function getCacheKey(connectionId: string, address: string): string {
  return `${connectionId}:${address.toLowerCase()}`;
}

function getCached(key: string, acceptStale = false): AssetsResponseData | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (acceptStale || Date.now() < entry.expiresAt) {
    return entry.data;
  }
  return undefined;
}

function setCache(key: string, data: AssetsResponseData, ttl: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttl * 1000 });
}

export function resetCache(): void {
  cache.clear();
}

// ---------------------------------------------------------------------------
// CoinStats API call
// ---------------------------------------------------------------------------
async function fetchFromCoinStats(
  env: Env,
  connectionId: string,
  address: string,
): Promise<CoinStatsItem[]> {
  const url = `${env.COINSTATS_BASE_URL}/wallet/balance?address=${encodeURIComponent(address)}&connectionId=${encodeURIComponent(connectionId)}`;

  const res = await fetch(url, {
    headers: { 'X-API-KEY': env.COINSTATS_API_KEY },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`CoinStats API error: ${res.status} ${res.statusText || 'Unknown Error'}`);
  }

  const raw = await res.json();
  return Array.isArray(raw) ? raw : (raw as any).balance ?? [];
}

// ---------------------------------------------------------------------------
// Response normalization
// ---------------------------------------------------------------------------
function normalizeAssets(
  items: CoinStatsItem[],
  address: string,
  chain: string,
): AssetsResponseData {
  const assets: AssetItem[] = items.map((item) => {
    const amount = item.amount ?? 0;
    const priceUsd = item.price ?? 0;

    return {
      coinId: item.coinId ?? null,
      symbol: item.symbol ?? '',
      name: item.name ?? null,
      amount,
      priceUsd: priceUsd || null,
      valueUsd: amount * priceUsd,
      change24h: item.pCh24h ?? null,
      decimals: item.decimals ?? null,
      contractAddress: item.contractAddress ?? null,
      logoUrl: item.imgUrl ?? null,
    };
  });

  const totalValueUsd = assets.reduce((sum, a) => sum + a.valueUsd, 0);

  return { address, chain, totalValueUsd, assets };
}

// ---------------------------------------------------------------------------
// Hono app
// ---------------------------------------------------------------------------
const app = new Hono<{ Bindings: Env }>();

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  maxAge: 86400,
}));

// OpenAPI spec JSON
app.get('/openapi.json', (c) => c.json(openApiSpec));

// Swagger UI
app.get('/docs', swaggerUI({ url: '/openapi.json' }));

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  } satisfies HealthResponse);
});

// List supported chains
app.get('/api/v1/chains', (c) => {
  const chains = getAllChains().map((ci) => ({
    chain: ci.caip2,
    name: ci.name,
    nativeCurrency: ci.nativeCurrency,
  }));
  return c.json({ success: true, data: chains } satisfies ChainsResponse);
});

// Fetch wallet assets
app.post('/api/v1/assets', async (c) => {
  let body: { address?: string; chain?: string; provider?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' } satisfies AssetsResponse, 400);
  }

  // Validate address
  if (!body.address) {
    return c.json({ success: false, error: "Field 'address' is required" } satisfies AssetsResponse, 400);
  }

  // Validate chain
  if (!body.chain) {
    return c.json({ success: false, error: "Field 'chain' is required" } satisfies AssetsResponse, 400);
  }

  // Validate chain is supported
  const chainInfo = getChainInfo(body.chain);
  if (!chainInfo) {
    const supported = getAllChains().map((c) => c.caip2).join(', ');
    return c.json({
      success: false,
      error: `Unsupported chain: '${body.chain}'. Supported: ${supported}`,
    } satisfies AssetsResponse, 400);
  }

  const { address, chain, provider } = body;
  const connectionId = chainInfo.connectionId;
  const cacheKey = getCacheKey(connectionId, address);

  // Check fresh cache (always keyed by connectionId:address, independent of provider)
  const ttl = parseInt(c.env.ASSETS_CACHE_TTL || '30', 10);
  const cached = getCached(cacheKey);
  if (cached) {
    return c.json({ success: true, data: cached } satisfies AssetsResponse);
  }

  // Provider routing
  const selected = (provider || 'auto').toLowerCase();

  // Helper: classify and return the appropriate error response
  function handleUpstreamError(err: unknown): Response {
    const stale = getCached(cacheKey, true);
    if (stale) {
      return c.json({ success: true, data: stale } satisfies AssetsResponse);
    }
    const message = (err as Error).message;
    if (err instanceof DOMException && err.name === 'AbortError') {
      return c.json({ success: false, error: 'Upstream API timeout' } satisfies AssetsResponse, 504);
    }
    if (message.startsWith('CoinStats API error:') || message.startsWith('OKX API error:')) {
      return c.json({ success: false, error: message } satisfies AssetsResponse, 502);
    }
    return c.json({ success: false, error: 'Upstream request failed' } satisfies AssetsResponse, 502);
  }

  // Explicit OKX: try OKX only, fail on error
  if (selected === 'okx') {
    try {
      const result = await fetchOkxAssets(c.env, address, chain);
      setCache(cacheKey, result, ttl);
      return c.json({ success: true, data: result } satisfies AssetsResponse);
    } catch (err) {
      return c.json({ success: false, error: (err as Error).message } satisfies AssetsResponse, 502);
    }
  }

  // Explicit TRON: try TRON Grid API only, fail on error
  if (selected === 'tron') {
    try {
      const result = await fetchTronAssets(address, chain);
      setCache(cacheKey, result, ttl);
      return c.json({ success: true, data: result } satisfies AssetsResponse);
    } catch (err) {
      return c.json({ success: false, error: (err as Error).message } satisfies AssetsResponse, 502);
    }
  }

  // Explicit Stellar: try Horizon API only, fail on error
  if (selected === 'stellar') {
    try {
      const result = await fetchStellarAssets(address, chain);
      setCache(cacheKey, result, ttl);
      return c.json({ success: true, data: result } satisfies AssetsResponse);
    } catch (err) {
      return c.json({ success: false, error: (err as Error).message } satisfies AssetsResponse, 502);
    }
  }

  // Try CoinStats (auto mode will fall back to OKX/TRON/Stellar on failure)
  try {
    const csData = await fetchFromCoinStats(c.env, connectionId, address);
    const normalized = normalizeAssets(csData, address, chain);
    setCache(cacheKey, normalized, ttl);
    return c.json({ success: true, data: normalized } satisfies AssetsResponse);
  } catch (err) {
    // Auto mode: fall back to OKX (EVM chains) or TRON Grid (TRX chains)
    if (selected === 'auto') {
      const fallbacks: Array<{
        name: string;
        fetch: () => Promise<AssetsResponseData>;
      }> = [];

      if (isOkxChainSupported(chain)) {
        fallbacks.push({
          name: 'OKX',
          fetch: () => fetchOkxAssets(c.env, address, chain),
        });
      }
      if (isTronChainSupported(chain)) {
        fallbacks.push({
          name: 'TRON',
          fetch: () => fetchTronAssets(address, chain),
        });
      }
      if (isStellarChainSupported(chain)) {
        fallbacks.push({
          name: 'Stellar',
          fetch: () => fetchStellarAssets(address, chain),
        });
      }

      let lastError: unknown = err;
      for (const fb of fallbacks) {
        try {
          console.log(
            `CoinStats failed for ${chain}, trying ${fb.name}: ${(err as Error).message}`,
          );
          const result = await fb.fetch();
          setCache(cacheKey, result, ttl);
          return c.json({ success: true, data: result } satisfies AssetsResponse);
        } catch (fbErr) {
          lastError = fbErr;
          console.log(
            `${fb.name} also failed for ${chain}: ${(fbErr as Error).message}`,
          );
        }
      }
      // All fallbacks exhausted
      return handleUpstreamError(lastError);
    }
    // No fallback applicable
    return handleUpstreamError(err);
  }
});

// ---------------------------------------------------------------------------
// Export for Cloudflare Worker
// ---------------------------------------------------------------------------
export default {
  fetch: app.fetch,
};
