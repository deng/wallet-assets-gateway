// ---------------------------------------------------------------------------
// OpenAPI 3.0.3 spec
// ---------------------------------------------------------------------------
export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Wallet Assets Gateway',
    description: 'Proxies CoinStats OpenAPI v1 to fetch wallet asset holdings by address and chain (CAIP-2 format). Returns standardized token balances with USD pricing.',
    version: '0.1.0',
  },
  servers: [
    { url: 'https://wallet-assets.bithub.pro', description: 'Production' },
    { url: 'http://localhost:8787', description: 'Local dev' },
  ],
  paths: {
    '/health': {
      get: {
        summary: 'Health check',
        tags: ['System'],
        responses: {
          '200': {
            description: 'Service healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'healthy' },
                    timestamp: { type: 'string', format: 'date-time' },
                    version: { type: 'string', example: '0.1.0' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/chains': {
      get: {
        summary: 'List supported chains',
        description: 'Returns all supported chains with CAIP-2 identifiers and metadata.',
        tags: ['Chains'],
        responses: {
          '200': {
            description: 'Chain list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Chain' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/assets': {
      post: {
        summary: 'Fetch wallet assets',
        description: 'Fetch token balances for a wallet address on a specific chain.',
        tags: ['Assets'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['address', 'chain'],
                properties: {
                  address: {
                    type: 'string',
                    description: 'Wallet address',
                    example: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
                  },
                  chain: {
                    type: 'string',
                    description: 'CAIP-2 chain identifier',
                    example: 'eip155:1',
                  },
                  provider: {
                    type: 'string',
                    description: 'Data provider: "auto" (default, OKX first with CoinStats fallback), "coinstats", "okx"',
                    example: 'auto',
                    enum: ['auto', 'coinstats', 'okx'],
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Assets data',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/AssetsData' },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Invalid request (missing/unsupported fields)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: false },
                    error: { type: 'string' },
                  },
                },
              },
            },
          },
          '502': {
            description: 'Upstream API error',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: false },
                    error: { type: 'string' },
                  },
                },
              },
            },
          },
          '504': {
            description: 'Upstream API timeout',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: false },
                    error: { type: 'string', example: 'Upstream API timeout' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Chain: {
        type: 'object',
        properties: {
          chain: { type: 'string', example: 'eip155:1' },
          name: { type: 'string', example: 'Ethereum' },
          nativeCurrency: { type: 'string', example: 'ETH' },
        },
      },
      AssetItem: {
        type: 'object',
        properties: {
          coinId: { type: 'string', nullable: true, example: 'ethereum' },
          symbol: { type: 'string', example: 'ETH' },
          name: { type: 'string', nullable: true, example: 'Ethereum' },
          amount: { type: 'number', example: 1.5 },
          priceUsd: { type: 'number', nullable: true, example: 2000.50 },
          valueUsd: { type: 'number', example: 3000.75 },
          change24h: { type: 'number', nullable: true, example: 5.25 },
          decimals: { type: 'integer', nullable: true, example: 18 },
          contractAddress: { type: 'string', nullable: true, example: null },
          logoUrl: { type: 'string', nullable: true, example: 'https://static.coinstats.app/coins/ethereum.png' },
        },
      },
      AssetsData: {
        type: 'object',
        properties: {
          address: { type: 'string', example: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
          chain: { type: 'string', example: 'eip155:1' },
          totalValueUsd: { type: 'number', example: 3500.75 },
          assets: {
            type: 'array',
            items: { $ref: '#/components/schemas/AssetItem' },
          },
        },
      },
    },
  },
} as const;
