import { describe, it, expect, vi, afterEach } from 'vitest';

const MOCK_OKX_RESPONSE = {
  code: '0',
  msg: '',
  data: [
    {
      chainIndex: '1',
      tokenAssets: [
        {
          chainIndex: '1',
          tokenAddress: '',
          symbol: 'ETH',
          balance: '1.5',
          tokenPrice: '2000.50',
        },
        {
          chainIndex: '1',
          tokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          symbol: 'USDT',
          balance: '500',
          tokenPrice: '1.00',
        },
      ],
    },
  ],
};

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

async function createApp() {
  const index = await import('../src/index');
  index.resetCache();
  return index.default;
}

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

function mockOkxSuccess(): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : input.toString());
    if (url.includes('okx.com')) {
      return new Response(JSON.stringify(MOCK_OKX_RESPONSE), {
        status: 200,
        statusText: 'OK',
      });
    }
    throw new Error('fetch failed');
  });
}

describe('POST /api/v1/assets with provider=okx', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return assets for OKX-supported chain', async () => {
    mockOkxSuccess();
    const app = await createApp();

    const res = await app.fetch(
      mockRequest('POST', 'http://localhost/api/v1/assets', {
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        chain: 'eip155:1',
        provider: 'okx',
      }),
      mockEnv,
    );

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(true);
    const data = body.data as Record<string, unknown>;
    expect(data.chain).toBe('eip155:1');
    expect(data.totalValueUsd).toBe(3000.75 + 500); // 1.5*2000.50 + 500*1.00
    const assets = data.assets as Array<Record<string, unknown>>;
    expect(assets).toHaveLength(2);
    expect(assets[0].symbol).toBe('ETH');
    expect(assets[0].valueUsd).toBe(3000.75);
    expect(assets[1].symbol).toBe('USDT');
  });

  it('should return 502 when OKX API returns error code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: '1', msg: 'Invalid parameter' }), {
        status: 200,
        statusText: 'OK',
      }),
    );
    const app = await createApp();

    const res = await app.fetch(
      mockRequest('POST', 'http://localhost/api/v1/assets', {
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        chain: 'eip155:1',
        provider: 'okx',
      }),
      mockEnv,
    );

    expect(res.status).toBe(502);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(false);
    expect(body.error).toContain('OKX API error');
  });

  it('should return 502 when OKX API returns HTTP error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Rate limited', { status: 429, statusText: 'Too Many Requests' }),
    );
    const app = await createApp();

    const res = await app.fetch(
      mockRequest('POST', 'http://localhost/api/v1/assets', {
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        chain: 'eip155:1',
        provider: 'okx',
      }),
      mockEnv,
    );

    expect(res.status).toBe(502);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(false);
    expect(body.error).toContain('OKX API error: 429');
  });

  it('should return 502 for unsupported chain', async () => {
    const app = await createApp();

    const res = await app.fetch(
      mockRequest('POST', 'http://localhost/api/v1/assets', {
        address: '0x...',
        chain: 'bip122:000000000019d6689c085ae165831e93',
        provider: 'okx',
      }),
      mockEnv,
    );

    expect(res.status).toBe(502);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(false);
    expect(body.error).toContain('OKX');
  });

  it('should return 502 on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connect ECONNREFUSED'));
    const app = await createApp();

    const res = await app.fetch(
      mockRequest('POST', 'http://localhost/api/v1/assets', {
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        chain: 'eip155:1',
        provider: 'okx',
      }),
      mockEnv,
    );

    expect(res.status).toBe(502);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(false);
  });
});

describe('provider=auto (default)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should try CoinStats first and fall back to OKX on failure', async () => {
    // Mock CoinStats to fail, OKX to succeed
    let callCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : input.toString());
      callCount++;
      if (url.includes('openapiv1.coinstats.app')) {
        throw new Error('CoinStats unavailable');
      }
      if (url.includes('okx.com')) {
        return new Response(JSON.stringify(MOCK_OKX_RESPONSE), {
          status: 200,
          statusText: 'OK',
        });
      }
      throw new Error('unknown URL');
    });

    const app = await createApp();
    const res = await app.fetch(
      mockRequest('POST', 'http://localhost/api/v1/assets', {
        address: '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B',
        chain: 'eip155:1',
      }),
      mockEnv,
    );

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(true);
    // Should have called both CoinStats (failed) and OKX (succeeded)
    expect(callCount).toBe(2);
  });
});
