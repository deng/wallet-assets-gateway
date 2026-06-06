import { AssetItem, AssetsResponseData } from '../index';
import { COMMON_TRC20_TOKENS } from './tron-common-tokens';

// ---------------------------------------------------------------------------
// TRON Grid API base URLs
// ---------------------------------------------------------------------------
const TRON_GRID_MAINNET = 'https://api.trongrid.io';
const TRON_GRID_SHASTA = 'https://api.shasta.trongrid.io';
const TRON_GRID_NILE = 'https://nile.trongrid.io';

const TRX_DECIMALS = 6;

// ---------------------------------------------------------------------------
// TRC20 token metadata cache
// ---------------------------------------------------------------------------
interface TokenMeta {
  symbol: string;
  name: string;
  decimals: number;
}

const tokenMetaCache = new Map<string, TokenMeta>();

// ---------------------------------------------------------------------------
// Prime cache with well-known tokens on module load
// ---------------------------------------------------------------------------
function primeTokenMetaCache(): void {
  for (const [address, meta] of Object.entries(COMMON_TRC20_TOKENS)) {
    const cacheKey = `${TRON_GRID_MAINNET}:${address.toLowerCase()}`;
    tokenMetaCache.set(cacheKey, meta);
  }
}

primeTokenMetaCache();

export function resetTokenMetaCache(): void {
  tokenMetaCache.clear();
  primeTokenMetaCache();
}

// ---------------------------------------------------------------------------
// ABI decoding helpers (minimal, for constant_result from triggerconstantcontract)
// ---------------------------------------------------------------------------

/** Decode a uint256 from the last 32 bytes of a hex string */
function abiDecodeUint256(hex: string): number {
  const clean = hex.replace('0x', '').padStart(64, '0');
  return parseInt(clean.slice(-64), 16);
}

/** Decode a dynamic string from ABI-encoded constant_result */
function abiDecodeString(hex: string): string {
  const clean = hex.replace('0x', '');
  if (clean.length < 128) return '';

  // offset (32 bytes) + length (32 bytes) + data
  const offset = parseInt(clean.substring(0, 64), 16) * 2;
  const length = parseInt(clean.substring(offset, offset + 64), 16);
  const start = offset + 64;
  const end = Math.min(start + length * 2, clean.length);

  let str = '';
  for (let i = start; i < end; i += 2) {
    const code = parseInt(clean.substring(i, i + 2), 16);
    if (code === 0) break;
    str += String.fromCharCode(code);
  }
  return str;
}

// ---------------------------------------------------------------------------
// TRC20 on-chain metadata resolution
// ---------------------------------------------------------------------------

// TRON base58 alphabet (same as Bitcoin base58)
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Convert a TRON base58 address to hex format (41-prefixed, no checksum). */
export function base58ToHex(base58: string): string {
  let num = 0n;
  for (const c of base58) {
    num = num * 58n + BigInt(BASE58_ALPHABET.indexOf(c));
  }
  let hex = num.toString(16);
  if (hex.length % 2 !== 0) hex = '0' + hex;
  // Strip trailing 4-byte checksum (8 hex chars)
  return hex.slice(0, hex.length - 8);
}

async function callContractMethod(
  baseUrl: string,
  contractAddress: string,
  functionSelector: string,
): Promise<string> {
  const res = await fetch(`${baseUrl}/wallet/triggerconstantcontract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      owner_address: '410000000000000000000000000000000000000000',
      contract_address: base58ToHex(contractAddress),
      function_selector: functionSelector,
      parameter: '',
    }),
    signal: AbortSignal.timeout(5_000),
  });

  if (!res.ok) {
    throw new Error(`TRON Grid API error: ${res.status}`);
  }

  const json = (await res.json()) as {
    result?: { result?: boolean };
    constant_result?: string[];
  };

  if (!json.result?.result) {
    throw new Error(`TRON contract call failed: ${functionSelector}`);
  }

  return json.constant_result?.[0] ?? '';
}

async function fetchTokenMeta(
  baseUrl: string,
  contractAddress: string,
): Promise<TokenMeta | null> {
  const cacheKey = `${baseUrl}:${contractAddress.toLowerCase()}`;
  const cached = tokenMetaCache.get(cacheKey);
  if (cached) return cached;

  try {
    const [symbolHex, nameHex, decimalsHex] = await Promise.all([
      callContractMethod(baseUrl, contractAddress, 'symbol()'),
      callContractMethod(baseUrl, contractAddress, 'name()'),
      callContractMethod(baseUrl, contractAddress, 'decimals()'),
    ]);

    const meta: TokenMeta = {
      symbol: abiDecodeString(symbolHex),
      name: abiDecodeString(nameHex),
      decimals: abiDecodeUint256(decimalsHex),
    };

    tokenMetaCache.set(cacheKey, meta);
    return meta;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBaseUrl(caip2: string): string {
  switch (caip2) {
    case 'tron:0x2b6653dc':
      return TRON_GRID_MAINNET;
    case 'tron:0x94a9059e':
      return TRON_GRID_SHASTA;
    case 'tron:0xcd8690dc':
      return TRON_GRID_NILE;
    default:
      throw new Error(`TRON: unsupported chain '${caip2}'`);
  }
}

// ---------------------------------------------------------------------------
// TRON Grid API types
// ---------------------------------------------------------------------------

interface TronAccountData {
  address: string;
  balance: number;
  trc20?: Array<Record<string, string>>;
}

// ---------------------------------------------------------------------------
// Main fetch function
// ---------------------------------------------------------------------------

export async function fetchTronAssets(
  address: string,
  caip2Chain: string,
): Promise<AssetsResponseData> {
  const baseUrl = getBaseUrl(caip2Chain);

  const res = await fetch(
    `${baseUrl}/v1/accounts/${encodeURIComponent(address)}`,
    {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!res.ok) {
    throw new Error(
      `TRON Grid API error: ${res.status} ${res.statusText || 'Unknown'}`,
    );
  }

  const json = (await res.json()) as {
    data?: TronAccountData[];
    success?: boolean;
  };
  const account = json.data?.[0];

  if (!account) {
    throw new Error(
      `TRON: account not found for address '${address}' on ${caip2Chain}`,
    );
  }

  const assets: AssetItem[] = [];

  // Native TRX
  const trxAmount = account.balance / 10 ** TRX_DECIMALS;
  assets.push({
    coinId: null,
    symbol: 'TRX',
    name: 'TRON',
    amount: trxAmount,
    priceUsd: null,
    valueUsd: 0,
    change24h: null,
    decimals: TRX_DECIMALS,
    contractAddress: null,
    logoUrl: null,
  });

  // TRC20 tokens
  const trc20List = account.trc20 ?? [];
  const tokenPromises = trc20List.map(async (entry) => {
    const contractAddress = Object.keys(entry)[0];
    const rawBalance = entry[contractAddress];
    const meta = await fetchTokenMeta(baseUrl, contractAddress);

    const decimals = meta?.decimals ?? 18;
    const amount = Number(rawBalance) / 10 ** decimals;

    return {
      coinId: null,
      symbol: meta?.symbol ?? 'UNKNOWN',
      name: meta?.name ?? null,
      amount,
      priceUsd: null,
      valueUsd: 0,
      change24h: null,
      decimals,
      contractAddress,
      logoUrl: null,
    } satisfies AssetItem;
  });

  const trc20Assets = await Promise.all(tokenPromises);
  assets.push(...trc20Assets);

  const totalValueUsd = assets.reduce((sum, a) => sum + a.valueUsd, 0);

  return { address, chain: caip2Chain, totalValueUsd, assets };
}

export function isTronChainSupported(caip2: string): boolean {
  return (
    caip2 === 'tron:0x2b6653dc' ||
    caip2 === 'tron:0x94a9059e' ||
    caip2 === 'tron:0xcd8690dc'
  );
}
