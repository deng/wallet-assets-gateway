// CAIP-2 chain identifiers
// See: https://github.com/ChainAgnostic/CAIPs/blob/master/CAIPs/caip-2.md

export interface ChainInfo {
  caip2: string;
  name: string;
  connectionId: string;
  nativeCurrency: string;
  /** OKX Wallet API chainIndex (numeric string). Undefined if not supported by OKX. */
  okxChainIndex?: string;
}

const CHAIN_MAP: Record<string, ChainInfo> = {
  'eip155:1': {
    caip2: 'eip155:1',
    name: 'Ethereum',
    connectionId: 'ethereum',
    nativeCurrency: 'ETH',
    okxChainIndex: '1',
  },
  'eip155:56': {
    caip2: 'eip155:56',
    name: 'BNB Smart Chain',
    connectionId: 'binance',
    nativeCurrency: 'BNB',
    okxChainIndex: '56',
  },
  'eip155:137': {
    caip2: 'eip155:137',
    name: 'Polygon',
    connectionId: 'polygon',
    nativeCurrency: 'MATIC',
    okxChainIndex: '137',
  },
  'eip155:42161': {
    caip2: 'eip155:42161',
    name: 'Arbitrum',
    connectionId: 'arbitrum',
    nativeCurrency: 'ETH',
    okxChainIndex: '42161',
  },
  'eip155:10': {
    caip2: 'eip155:10',
    name: 'Optimism',
    connectionId: 'optimism',
    nativeCurrency: 'ETH',
    okxChainIndex: '10',
  },
  'eip155:43114': {
    caip2: 'eip155:43114',
    name: 'Avalanche C-Chain',
    connectionId: 'avalanche',
    nativeCurrency: 'AVAX',
    okxChainIndex: '43114',
  },
  'eip155:8453': {
    caip2: 'eip155:8453',
    name: 'Base',
    connectionId: 'base',
    nativeCurrency: 'ETH',
    okxChainIndex: '8453',
  },
  'eip155:250': {
    caip2: 'eip155:250',
    name: 'Fantom',
    connectionId: 'fantom',
    nativeCurrency: 'FTM',
    okxChainIndex: '250',
  },
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': {
    caip2: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    name: 'Solana',
    connectionId: 'solana',
    nativeCurrency: 'SOL',
    okxChainIndex: '501',
  },
  'bip122:000000000019d6689c085ae165831e93': {
    caip2: 'bip122:000000000019d6689c085ae165831e93',
    name: 'Bitcoin',
    connectionId: 'bitcoin',
    nativeCurrency: 'BTC',
  },
  'eip155:100': {
    caip2: 'eip155:100',
    name: 'Gnosis',
    connectionId: 'gnosis',
    nativeCurrency: 'xDAI',
    okxChainIndex: '100',
  },
  'eip155:324': {
    caip2: 'eip155:324',
    name: 'zkSync Era',
    connectionId: 'zksync',
    nativeCurrency: 'ETH',
    okxChainIndex: '324',
  },
  'eip155:1101': {
    caip2: 'eip155:1101',
    name: 'Polygon zkEVM',
    connectionId: 'polygon-zkevm',
    nativeCurrency: 'ETH',
    okxChainIndex: '1101',
  },
  'eip155:534352': {
    caip2: 'eip155:534352',
    name: 'Scroll',
    connectionId: 'scroll',
    nativeCurrency: 'ETH',
    okxChainIndex: '534352',
  },
  'eip155:5000': {
    caip2: 'eip155:5000',
    name: 'Mantle',
    connectionId: 'mantle',
    nativeCurrency: 'MNT',
    okxChainIndex: '5000',
  },
  'eip155:81457': {
    caip2: 'eip155:81457',
    name: 'Blast',
    connectionId: 'blast',
    nativeCurrency: 'ETH',
    okxChainIndex: '81457',
  },
  'eip155:59144': {
    caip2: 'eip155:59144',
    name: 'Linea',
    connectionId: 'linea',
    nativeCurrency: 'ETH',
    okxChainIndex: '59144',
  },
  'tron:0x2b6653dc': {
    caip2: 'tron:0x2b6653dc',
    name: 'TRON',
    connectionId: 'tron',
    nativeCurrency: 'TRX',
  },
  'tron:0x94a9059e': {
    caip2: 'tron:0x94a9059e',
    name: 'TRON Shasta Testnet',
    connectionId: 'tron',
    nativeCurrency: 'TRX',
  },
  'tron:0xcd8690dc': {
    caip2: 'tron:0xcd8690dc',
    name: 'TRON Nile Testnet',
    connectionId: 'tron',
    nativeCurrency: 'TRX',
  },
};

export function getChainInfo(caip2: string): ChainInfo | undefined {
  return CHAIN_MAP[caip2];
}

export function getAllChains(): ChainInfo[] {
  return Object.values(CHAIN_MAP);
}
