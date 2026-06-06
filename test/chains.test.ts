import { describe, it, expect } from 'vitest';

async function createChains() {
  const mod = await import('../src/chains');
  return mod;
}

describe('chains', () => {
  it('should return chain info for eip155:1 (Ethereum)', async () => {
    const { getChainInfo } = await createChains();
    const info = getChainInfo('eip155:1');
    expect(info).toBeDefined();
    expect(info!.name).toBe('Ethereum');
    expect(info!.connectionId).toBe('ethereum');
    expect(info!.nativeCurrency).toBe('ETH');
  });

  it('should return undefined for unsupported chain', async () => {
    const { getChainInfo } = await createChains();
    expect(getChainInfo('eip155:999')).toBeUndefined();
  });

  it('should return all chains', async () => {
    const { getAllChains } = await createChains();
    const chains = getAllChains();
    expect(chains.length).toBeGreaterThanOrEqual(16);
    expect(chains.map(c => c.caip2)).toContain('eip155:1');
    expect(chains.map(c => c.caip2)).toContain('solana:5eykt4UsCvUn1EigmU9PfTkrPdbzpyCPPn');
  });

  it('should include OKX chainIndex for EVM chains', async () => {
    const { getChainInfo } = await createChains();
    expect(getChainInfo('eip155:1')!.okxChainIndex).toBe('1');
    expect(getChainInfo('eip155:56')!.okxChainIndex).toBe('56');
    expect(getChainInfo('eip155:10')!.okxChainIndex).toBe('10');
    expect(getChainInfo('eip155:137')!.okxChainIndex).toBe('137');
  });

  it('should include OKX chainIndex for Solana', async () => {
    const { getChainInfo } = await createChains();
    expect(getChainInfo('solana:5eykt4UsCvUn1EigmU9PfTkrPdbzpyCPPn')!.okxChainIndex).toBe('501');
  });

  it('should not have OKX chainIndex for Bitcoin', async () => {
    const { getChainInfo } = await createChains();
    expect(getChainInfo('bip122:000000000019d6689c085ae165831e93')!.okxChainIndex).toBeUndefined();
  });
});
