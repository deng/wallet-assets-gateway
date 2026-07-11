import { describe, it, expect, vi, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock TRON Grid API data
// ---------------------------------------------------------------------------
const MOCK_TRON_ACCOUNT_RESPONSE = {
  data: [
    {
      address: 'TJRabPrwbZy45sbavfcjinP1iFn6u5AMt2',
      balance: 123456789, // 123.456789 TRX
      trc20: [
        { TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t: '5000000' }, // 5 USDT (6 decimals)
        {
          'TG3XX1ExLvB9HxsDWjZVbSC1j1P8E7LHRd': '1000000000000000000',
        }, // 1 unknown token
      ],
    },
  ],
  success: true,
  meta: { at: 1234567890, page_size: 200 },
};

/** Convert a string to its hex representation (no Buffer dependency) */
function toHex(str: string): string {
  let hex = '';
  for (let i = 0; i < str.length; i++) {
    hex += str.charCodeAt(i).toString(16).padStart(2, '0');
  }
  return hex;
}

/** ABI-encode a string value (offset + length + data, each 32 bytes) */
function abiEncodedString(value: string): string {
  const hex = toHex(value);
  const padded = hex.padEnd(64, '0');
  return (
    '0000000000000000000000000000000000000000000000000000000000000020' +
    '00000000000000000000000000000000000000000000000000000000000000' +
    value.length.toString(16).padStart(2, '0') +
    padded
  );
}

function abiEncodedUint256(value: number): string {
  return value.toString(16).padStart(64, '0');
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

async function createApp() {
  const index = await import('../src/index');
  index.resetCache();
  // Reset TRON token metadata cache between tests
  const tron = await import('../src/providers/tron');
  tron.resetTokenMetaCache();
  return { app: index.default, tron };
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

// ---------------------------------------------------------------------------
// Provider-level tests
// ---------------------------------------------------------------------------
describe('TRON Grid API provider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should parse TRON account data with native TRX and TRC20 tokens', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : '');
      // Mock TRON Grid account API
      if (url.includes('/v1/accounts/')) {
        return new Response(JSON.stringify(MOCK_TRON_ACCOUNT_RESPONSE), {
          status: 200,
          statusText: 'OK',
        });
      }
      // Mock triggerconstantcontract
      if (url.includes('/wallet/triggerconstantcontract')) {
        const bodyStr = typeof init?.body === 'string' ? init.body : '{}';
        const parsed = JSON.parse(bodyStr);
        const selector = parsed.function_selector;
        const contractAddr = parsed.contract_address;

        // Only return metadata for the known USDT contract (hex format)
        if (contractAddr === '41a614f803b6fd780986a42c78ec9c7f77e6ded13c') {
          if (selector === 'symbol()') {
            return new Response(
              JSON.stringify({
                result: { result: true },
                constant_result: [abiEncodedString('USDT')],
              }),
              { status: 200 },
            );
          }
          if (selector === 'name()') {
            return new Response(
              JSON.stringify({
                result: { result: true },
                constant_result: [abiEncodedString('Tether USD')],
              }),
              { status: 200 },
            );
          }
          if (selector === 'decimals()') {
            return new Response(
              JSON.stringify({
                result: { result: true },
                constant_result: [abiEncodedUint256(6)],
              }),
              { status: 200 },
            );
          }
        }
        // Unknown token contract — simulate failure
        throw new Error('contract call failed');
      }
      throw new Error('unexpected URL: ' + url);
    });

    const { fetchTronAssets } = await import('../src/providers/tron');
    const result = await fetchTronAssets(
      'TJRabPrwbZy45sbavfcjinP1iFn6u5AMt2',
      'tron:0x2b6653dc',
    );

    expect(result.chain).toBe('tron:0x2b6653dc');
    expect(result.address).toBe('TJRabPrwbZy45sbavfcjinP1iFn6u5AMt2');

    // 3 assets: TRX + USDT + unknown token
    expect(result.assets).toHaveLength(3);

    // Native TRX
    const trx = result.assets[0];
    expect(trx.symbol).toBe('TRX');
    expect(trx.name).toBe('TRON');
    expect(trx.amount).toBeCloseTo(123.456789);
    expect(trx.decimals).toBe(6);
    expect(trx.contractAddress).toBeNull();
    expect(trx.priceUsd).toBeNull();

    // USDT
    const usdt = result.assets[1];
    expect(usdt.symbol).toBe('USDT');
    expect(usdt.name).toBe('Tether USD');
    expect(usdt.amount).toBeCloseTo(5);
    expect(usdt.decimals).toBe(6);
    expect(usdt.contractAddress).toBe('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');

    // Unknown token
    const unknown = result.assets[2];
    expect(unknown.symbol).toBe('UNKNOWN');
    expect(unknown.contractAddress).toBe(
      'TG3XX1ExLvB9HxsDWjZVbSC1j1P8E7LHRd',
    );
  });

  it('should throw on unsupported chain', async () => {
    const { fetchTronAssets } = await import('../src/providers/tron');
    await expect(
      fetchTronAssets('TJRabPrwbZy45sbavfcjinP1iFn6u5AMt2', 'eip155:1'),
    ).rejects.toThrow('TRON: unsupported chain');
  });

  it('should throw when account not found', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [], success: true }), {
        status: 200,
      }),
    );

    const { fetchTronAssets } = await import('../src/providers/tron');
    await expect(
      fetchTronAssets('TJRabPrwbZy45sbavfcjinP1iFn6u5AMt2', 'tron:0x2b6653dc'),
    ).rejects.toThrow('TRON: account not found');
  });

  it('should handle API error response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 429, statusText: 'Too Many Requests' }),
    );

    const { fetchTronAssets } = await import('../src/providers/tron');
    await expect(
      fetchTronAssets('TJRabPrwbZy45sbavfcjinP1iFn6u5AMt2', 'tron:0x2b6653dc'),
    ).rejects.toThrow('TRON Grid API error: 429');
  });

  it('should cache token metadata across calls', async () => {
    let contractCallCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, _init) => {
      const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : '');
      if (url.includes('/v1/accounts/')) {
        return new Response(JSON.stringify(MOCK_TRON_ACCOUNT_RESPONSE), {
          status: 200,
        });
      }
      if (url.includes('/wallet/triggerconstantcontract')) {
        contractCallCount++;
        return new Response(
          JSON.stringify({
            result: { result: true },
            constant_result: [abiEncodedUint256(6)],
          }),
          { status: 200 },
        );
      }
      throw new Error('unexpected URL');
    });

    const { fetchTronAssets } = await import('../src/providers/tron');
    await fetchTronAssets('TJRabPrwbZy45sbavfcjinP1iFn6u5AMt2', 'tron:0x2b6653dc');
    const firstCalls = contractCallCount;

    // Second call to same address+chain should reuse cached token metadata
    await fetchTronAssets('TJRabPrwbZy45sbavfcjinP1iFn6u5AMt2', 'tron:0x2b6653dc');
    // Contract calls should be cached after first call
    expect(contractCallCount).toBe(firstCalls);
  });
});

// ---------------------------------------------------------------------------
// Server integration tests
// ---------------------------------------------------------------------------
describe('POST /api/v1/assets (TRON provider)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return TRX assets with provider=tron', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : '');
      if (url.includes('/v1/accounts/')) {
        return new Response(JSON.stringify(MOCK_TRON_ACCOUNT_RESPONSE), {
          status: 200,
        });
      }
      if (url.includes('/wallet/triggerconstantcontract')) {
        const bodyStr = typeof init?.body === 'string' ? init.body : '{}';
        const parsed = JSON.parse(bodyStr);
        const selector = parsed.function_selector;
        if (selector === 'symbol()') {
          return new Response(
            JSON.stringify({ result: { result: true }, constant_result: [abiEncodedString('USDT')] }),
            { status: 200 },
          );
        }
        if (selector === 'name()') {
          return new Response(
            JSON.stringify({ result: { result: true }, constant_result: [abiEncodedString('Tether USD')] }),
            { status: 200 },
          );
        }
        if (selector === 'decimals()') {
          return new Response(
            JSON.stringify({ result: { result: true }, constant_result: [abiEncodedUint256(6)] }),
            { status: 200 },
          );
        }
        throw new Error('unknown selector');
      }
      if (url.includes('openapiv1.coinstats.app') || url.includes('okx.com')) {
        throw new Error('unexpected provider call');
      }
      throw new Error('unexpected URL');
    });

    const { app } = await createApp();
    const res = await app.fetch(
      mockRequest('POST', 'http://localhost/api/v1/assets', {
        address: 'TJRabPrwbZy45sbavfcjinP1iFn6u5AMt2',
        chain: 'tron:0x2b6653dc',
        provider: 'tron',
      }),
      mockEnv,
    );

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(true);

    const data = body.data as Record<string, unknown>;
    expect(data.chain).toBe('tron:0x2b6653dc');
    const assets = data.assets as Array<Record<string, unknown>>;
    expect(assets).toHaveLength(3);
    expect(assets[0].symbol).toBe('TRX');
  });

  it('should return 400 for unsupported chain', async () => {
    const { app } = await createApp();
    const res = await app.fetch(
      mockRequest('POST', 'http://localhost/api/v1/assets', {
        address: 'TJRabPrwbZy45sbavfcjinP1iFn6u5AMt2',
        chain: 'eip155:999',
        provider: 'tron',
      }),
      mockEnv,
    );

    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(false);
  });

  it('should return 502 on TRON API error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 429, statusText: 'Too Many Requests' }),
    );

    const { app } = await createApp();
    const res = await app.fetch(
      mockRequest('POST', 'http://localhost/api/v1/assets', {
        address: 'TJRabPrwbZy45sbavfcjinP1iFn6u5AMt2',
        chain: 'tron:0x2b6653dc',
        provider: 'tron',
      }),
      mockEnv,
    );

    expect(res.status).toBe(502);
  });
});

// ---------------------------------------------------------------------------
// Chain config tests
// ---------------------------------------------------------------------------
describe('TRON chain config', () => {
  it('should list tron chains in /api/v1/chains', async () => {
    const { app } = await createApp();
    const res = await app.fetch(
      mockRequest('GET', 'http://localhost/api/v1/chains'),
      mockEnv,
    );
    const body = await res.json() as Record<string, unknown>;
    const data = body.data as Array<Record<string, unknown>>;

    const mainnet = data.find((c) => c.chain === 'tron:0x2b6653dc');
    expect(mainnet).toBeDefined();
    expect(mainnet!.name).toBe('TRON');
    expect(mainnet!.nativeCurrency).toBe('TRX');

    const shasta = data.find((c) => c.chain === 'tron:0x94a9059e');
    expect(shasta).toBeDefined();
    expect(shasta!.name).toBe('TRON Shasta');

    const nile = data.find((c) => c.chain === 'tron:0xcd8690dc');
    expect(nile).toBeDefined();
    expect(nile!.name).toBe('TRON Nile');
  });
});
