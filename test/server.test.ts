import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
const MOCK_COINSTATS_RESPONSE = [
  {
    coinId: 'ethereum',
    amount: 1.5,
    decimals: 18,
    contractAddress: null,
    chain: 'ethereum',
    name: 'Ethereum',
    symbol: 'ETH',
    price: 2000.50,
    priceBtc: 0.02595,
    imgUrl: 'https://static.coinstats.app/coins/ethereum.png',
    pCh24h: 5.25,
    rank: 2,
    volume: 12000000000,
    connectionId: 'ethereum',
  },
  {
    coinId: 'tether',
    amount: 500,
    decimals: 6,
    contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    chain: 'ethereum',
    name: 'Tether',
    symbol: 'USDT',
    price: 1.00,
    priceBtc: 0.0000129,
    imgUrl: 'https://static.coinstats.app/coins/tether.png',
    pCh24h: 0.01,
    rank: 6,
    volume: 8000000000,
    connectionId: 'ethereum',
  },
];

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
async function createApp() {
  const index = await import('../src/index');
  index.resetCache();
  return index.default;
}

const mockEnv = {
  COINSTATS_BASE_URL: 'https://openapiv1.coinstats.app',
  ASSETS_CACHE_TTL: '30',
  COINSTATS_API_KEY: 'test-api-key',
  OKX_BASE_URL: 'https://www.okx.com',
  OKX_API_KEY: 'test-okx-key',
  OKX_SECRET_KEY: 'test-okx-secret',
  OKX_API_PASSPHRASE: 'test-okx-pass',
  OKX_PROJECT_ID: 'test-okx-project',
};

function mockRequest(method: string, url: string, body?: unknown): Request {
  if (body !== undefined) {
    return new Request(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  return new Request(url, { method });
}

function mockCoinStatsSuccess(): void {
  // Only mock CoinStats API calls; let other fetch calls (e.g. OKX) fail naturally
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : input.toString());
    if (url.includes('openapiv1.coinstats.app')) {
      return new Response(JSON.stringify(MOCK_COINSTATS_RESPONSE), {
        status: 200,
        statusText: 'OK',
      });
    }
    // Reject non-CoinStats calls so provider fallback works
    throw new Error('fetch failed');
  });
}

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------
describe('GET /health', () => {
  it('should return healthy status with all fields', async () => {
    const app = await createApp();
    const res = await app.fetch(mockRequest('GET', 'http://localhost/health'), mockEnv);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.status).toBe('healthy');
    expect(body.timestamp).toBeDefined();
    expect(typeof body.timestamp).toBe('string');
    expect(body.version).toBe('0.1.0');
  });
});

// ---------------------------------------------------------------------------
// OpenAPI spec and Swagger UI
// ---------------------------------------------------------------------------
describe('OpenAPI spec', () => {
  it('should serve OpenAPI JSON at /openapi.json', async () => {
    const app = await createApp();
    const res = await app.fetch(mockRequest('GET', 'http://localhost/openapi.json'), mockEnv);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.openapi).toBe('3.0.3');
    expect(body.info).toBeDefined();
    expect((body.info as Record<string, unknown>).title).toBe('Wallet Assets Gateway');
    expect(body.paths).toBeDefined();
    expect((body.paths as Record<string, unknown>)['/api/v1/assets']).toBeDefined();
    expect((body.paths as Record<string, unknown>)['/api/v1/chains']).toBeDefined();
    expect((body.paths as Record<string, unknown>)['/health']).toBeDefined();
  });

  it('should serve Swagger UI at /docs', async () => {
    const app = await createApp();
    const res = await app.fetch(mockRequest('GET', 'http://localhost/docs'), mockEnv);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('swagger-ui');
    expect(text).toContain('/openapi.json');
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/chains
// ---------------------------------------------------------------------------
describe('GET /api/v1/chains', () => {
  it('should return chain list with required properties', async () => {
    const app = await createApp();
    const res = await app.fetch(mockRequest('GET', 'http://localhost/api/v1/chains'), mockEnv);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(true);

    const data = body.data as Array<Record<string, unknown>>;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(10);

    // Check first chain has all required properties
    const eth = data.find((c) => c.chain === 'eip155:1');
    expect(eth).toBeDefined();
    expect(eth!.name).toBe('Ethereum');
    expect(eth!.nativeCurrency).toBe('ETH');

    // Check Solana is included
    const sol = data.find((c) => c.chain === 'solana:5eykt4UsCvUn1EigmU9PfTkrPdbzpyCPPn');
    expect(sol).toBeDefined();
    expect(sol!.nativeCurrency).toBe('SOL');
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/assets
// ---------------------------------------------------------------------------
describe('POST /api/v1/assets', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return normalized assets for valid request', async () => {
    mockCoinStatsSuccess();
    const app = await createApp();

    const res = await app.fetch(
      mockRequest('POST', 'http://localhost/api/v1/assets', {
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        chain: 'eip155:1',
      }),
      mockEnv,
    );

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(true);

    const data = body.data as Record<string, unknown>;
    expect(data.address).toBe('0xdAC17F958D2ee523a2206206994597C13D831ec7');
    expect(data.chain).toBe('eip155:1');
    expect(data.totalValueUsd).toBe(3500.75);

    const assets = data.assets as Array<Record<string, unknown>>;
    expect(assets).toHaveLength(2);

    // First asset: ETH
    const eth = assets[0];
    expect(eth.coinId).toBe('ethereum');
    expect(eth.symbol).toBe('ETH');
    expect(eth.name).toBe('Ethereum');
    expect(eth.amount).toBe(1.5);
    expect(eth.priceUsd).toBe(2000.50);
    expect(eth.valueUsd).toBe(3000.75);
    expect(eth.change24h).toBe(5.25);
    expect(eth.decimals).toBe(18);
    expect(eth.contractAddress).toBeNull();
    expect(eth.logoUrl).toBe('https://static.coinstats.app/coins/ethereum.png');

    // Second asset: USDT
    const usdt = assets[1];
    expect(usdt.coinId).toBe('tether');
    expect(usdt.symbol).toBe('USDT');
    expect(usdt.name).toBe('Tether');
    expect(usdt.amount).toBe(500);
    expect(usdt.priceUsd).toBe(1.00);
    expect(usdt.valueUsd).toBe(500.00);
    expect(usdt.change24h).toBe(0.01);
    expect(usdt.decimals).toBe(6);
    expect(usdt.contractAddress).toBe('0xdAC17F958D2ee523a2206206994597C13D831ec7');
    expect(usdt.logoUrl).toBe('https://static.coinstats.app/coins/tether.png');
  });

  it('should return 400 when address is missing', async () => {
    const app = await createApp();
    const res = await app.fetch(
      mockRequest('POST', 'http://localhost/api/v1/assets', {
        chain: 'eip155:1',
      }),
      mockEnv,
    );
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(false);
    expect(body.error).toBe("Field 'address' is required");
  });

  it('should return 400 when chain is missing', async () => {
    const app = await createApp();
    const res = await app.fetch(
      mockRequest('POST', 'http://localhost/api/v1/assets', {
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      }),
      mockEnv,
    );
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(false);
    expect(body.error).toBe("Field 'chain' is required");
  });

  it('should return 400 for unsupported chain', async () => {
    const app = await createApp();
    const res = await app.fetch(
      mockRequest('POST', 'http://localhost/api/v1/assets', {
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        chain: 'eip155:999',
      }),
      mockEnv,
    );
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(false);
    expect(body.error).toContain("Unsupported chain: 'eip155:999'");
    expect(body.error).toContain('Supported:');
    // Should include at least one valid chain in the supported list
    expect(body.error).toContain('eip155:1');
  });

  it('should return 502 when upstream returns 429 error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Rate limited', { status: 429, statusText: 'Too Many Requests' }),
    );
    const app = await createApp();

    const res = await app.fetch(
      mockRequest('POST', 'http://localhost/api/v1/assets', {
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        chain: 'eip155:1',
      }),
      mockEnv,
    );
    expect(res.status).toBe(502);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(false);
    expect(body.error).toBe('OKX API error: 429 Rate limited');
  });

  it('should return 504 on API timeout', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new DOMException('The operation was aborted', 'AbortError'),
    );
    const app = await createApp();

    const res = await app.fetch(
      mockRequest('POST', 'http://localhost/api/v1/assets', {
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        chain: 'eip155:1',
      }),
      mockEnv,
    );
    expect(res.status).toBe(504);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(false);
    expect(body.error).toBe('Upstream API timeout');
  });

  it('should return 502 on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('connect ECONNREFUSED'),
    );
    const app = await createApp();

    const res = await app.fetch(
      mockRequest('POST', 'http://localhost/api/v1/assets', {
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        chain: 'eip155:1',
      }),
      mockEnv,
    );
    expect(res.status).toBe(502);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(false);
    expect(body.error).toBe('Upstream request failed');
  });
});

// ---------------------------------------------------------------------------
// Caching
// ---------------------------------------------------------------------------
describe('Caching', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should serve cached data on second request (fetch only called once)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : input.toString());
      if (url.includes('openapiv1.coinstats.app')) {
        return new Response(JSON.stringify(MOCK_COINSTATS_RESPONSE), {
          status: 200,
          statusText: 'OK',
        });
      }
      throw new Error('fetch failed');
    });

    const app = await createApp();

    const requestBody = {
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      chain: 'eip155:1',
      provider: 'coinstats',
    };

    // First request — should call API
    const res1 = await app.fetch(
      mockRequest('POST', 'http://localhost/api/v1/assets', requestBody),
      mockEnv,
    );
    expect(res1.status).toBe(200);
    const body1 = await res1.json() as Record<string, unknown>;
    expect(body1.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Second request — should use cache, not call API again
    const res2 = await app.fetch(
      mockRequest('POST', 'http://localhost/api/v1/assets', requestBody),
      mockEnv,
    );
    expect(res2.status).toBe(200);
    const body2 = await res2.json() as Record<string, unknown>;
    expect(body2.success).toBe(true);
    expect(body2.data).toBeDefined();
    // fetch should still have been called only once
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('should fall back to stale cache when CoinStats fails', async () => {
    const app = await createApp();

    const requestBody = {
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      chain: 'eip155:1',
      provider: 'coinstats',
    };

    // First request — populate cache
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : input.toString());
      if (url.includes('openapiv1.coinstats.app')) {
        return new Response(JSON.stringify(MOCK_COINSTATS_RESPONSE), {
          status: 200,
          statusText: 'OK',
        });
      }
      throw new Error('fetch failed');
    });
    const res1 = await app.fetch(
      mockRequest('POST', 'http://localhost/api/v1/assets', requestBody),
      mockEnv,
    );
    expect(res1.status).toBe(200);

    // Second request — API fails, should fall back to stale cache
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('connect ECONNREFUSED'),
    );
    const res2 = await app.fetch(
      mockRequest('POST', 'http://localhost/api/v1/assets', requestBody),
      mockEnv,
    );
    expect(res2.status).toBe(200);
    const body2 = await res2.json() as Record<string, unknown>;
    expect(body2.success).toBe(true);
    expect(body2.data).toBeDefined();
    const data = body2.data as Record<string, unknown>;
    expect(data.totalValueUsd).toBe(3500.75);
  });
});

// ---------------------------------------------------------------------------
// CORS headers
// ---------------------------------------------------------------------------
describe('CORS headers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should include access-control-allow-origin: *', async () => {
    const app = await createApp();
    const res = await app.fetch(mockRequest('GET', 'http://localhost/health'), mockEnv);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('should respond to OPTIONS preflight with correct CORS headers', async () => {
    const app = await createApp();
    const res = await app.fetch(
      new Request('http://localhost/api/v1/assets', { method: 'OPTIONS' }),
      mockEnv,
    );
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const allowMethods = res.headers.get('access-control-allow-methods');
    expect(allowMethods).toContain('GET');
    expect(allowMethods).toContain('POST');
    expect(res.headers.get('access-control-max-age')).toBe('86400');
  });
});
