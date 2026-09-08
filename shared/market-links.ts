import type { Market } from './types.js';

// Verified against aave/interface src/ui-config/marketsConfig.tsx and
// bgd-labs/aave-address-book on 2026-09-08. Match BOTH chain and pool:
// several chains reuse a pool address; Ethereum has multiple separate pools.
const AAVE_POOLS: [number, string, string][] = [
  [1, '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2', 'proto_mainnet_v3'],
  [1, '0x4e033931ad43597d96D6bcc25c280717730B58B1', 'proto_lido_v3'],
  [1, '0x0AA97c284e98396202b6A04024F5E2c65026F3c0', 'proto_etherfi_v3'],
  [1, '0xAe05Cd22df81871bc7cC2a04BeCfb516bFe332C8', 'proto_horizon_v3'],
  [8453, '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5', 'proto_base_v3'],
  [42161, '0x794a61358D6845594F94dc1DB02A252b5b4814aD', 'proto_arbitrum_v3'],
  [43114, '0x794a61358D6845594F94dc1DB02A252b5b4814aD', 'proto_avalanche_v3'],
  [10, '0x794a61358D6845594F94dc1DB02A252b5b4814aD', 'proto_optimism_v3'],
  [137, '0x794a61358D6845594F94dc1DB02A252b5b4814aD', 'proto_polygon_v3'],
  [59144, '0xc47b8C00b0f69a36fa203Ffeac0334874574a8Ac', 'proto_linea_v3'],
  [146, '0x5362dBb1e601abF3a4c14c22ffEdA64042E5eAA3', 'proto_sonic_v3'],
  [9745, '0x925a2A7214Ed92428B5b1B090F80b25700095e12', 'proto_plasma_v3'],
  [57073, '0x2816cf15F6d2A220E789aA011D5EE4eB6c47FEbA', 'proto_ink_v3'],
  [4326, '0x7e324AbC5De01d112AfC03a584966ff199741C28', 'proto_megaeth_v3'],
  [196, '0xE3F3Caefdd7180F884c01E57f65Df979Af84f116', 'proto_xlayer_v3'],
  [5000, '0x458F293454fE0d67EC0655f3672301301DD51422', 'proto_mantle_v3'],
  [100, '0xb50201558B00496A145fE76f7424749556E326D8', 'proto_gnosis_v3'],
  [56, '0x6807dc923806fE8Fd134338EABCA509979a7e0cB', 'proto_bnb_v3'],
  [143, '0x69a5F9AD4f96ebf0a0C792dD42a01cC5C0102fef', 'proto_monad_v3'],
  [534352, '0x11fCfe756c05AD438e312a7fd934381537D3cFfe', 'proto_scroll_v3'],
  [324, '0x78e30497a3c7527d953c6B1E3541b021A98Ac43c', 'proto_zksync_v3'],
  [42220, '0x3E59A31363E2ad014dcbc521c4a0d5757d9f3402', 'proto_celo_v3'],
  [1868, '0xDd3d7A7d03D9fD9ef45f3E587287922eF65CA38B', 'proto_soneium_v3'],
  [1088, '0x90df02551bB792286e8D4f13E0e357b4Bf1D6a57', 'proto_metis_v3'],
];
const aavePools = new Map(AAVE_POOLS.map(([chain, pool, slug]) => [`${chain}:${pool.toLowerCase()}`, slug]));

// Morpho's official app chainIdentifier configuration, verified in browser.
// SDK morphoChainSlug differs from app routes (optimism, robinhood).
// Arc (5042) is API-listed but its official app route returns Not Found.
const MORPHO_CHAINS: Record<number, string> = {
  1: 'ethereum',
  8453: 'base',
  42161: 'arbitrum',
  10: 'opmainnet',
  137: 'polygon',
  130: 'unichain',
  999: 'hyperevm',
  747474: 'katana',
  143: 'monad',
  988: 'stable',
  4217: 'tempo',
  4663: 'robinhood-chain',
};
const isAddress = (value: string) => /^0x[0-9a-f]{40}$/i.test(value);

export function aaveV3MarketUrl(chainId: number, pool: string, token: string): string | undefined {
  const marketName = aavePools.get(`${chainId}:${pool.toLowerCase()}`);
  if (!marketName || !isAddress(token)) return undefined;
  return `https://app.aave.com/reserve-overview/?${new URLSearchParams({ underlyingAsset: token, marketName })}`;
}

export function aaveV4MarketUrl(reserveId: string): string | undefined {
  if (!reserveId || !/^[A-Za-z0-9+/]+={0,2}$/.test(reserveId)) return undefined;
  return `https://pro.aave.com/explore/reserve/${encodeURIComponent(reserveId)}`;
}

export function morphoMarketUrl(chainId: number, marketId: string): string | undefined {
  const chain = MORPHO_CHAINS[chainId];
  if (!chain || !/^0x[0-9a-f]{64}$/i.test(marketId)) return undefined;
  return `https://app.morpho.org/${chain}/market/${marketId}`;
}

/** Re-resolve cached rows too. Unknown routes have no link, never a wrong fallback. */
export function marketUrl(market: Market): string | undefined {
  if (market.protocol === 'Morpho') return morphoMarketUrl(market.chainId, market.address);
  if (market.version === 'V4') return aaveV4MarketUrl(String(market.historyRef.reserveId ?? ''));
  if (market.version === 'V3') return aaveV3MarketUrl(market.chainId, market.address, market.asset.address);
  return undefined;
}
