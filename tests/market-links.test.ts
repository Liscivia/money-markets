import assert from 'node:assert/strict';
import test from 'node:test';
import { aaveV3MarketUrl, aaveV4MarketUrl, morphoMarketUrl, marketUrl } from '../shared/market-links.js';
import type { Market } from '../shared/types.js';

const token = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const hash = `0x${'a'.repeat(64)}`;
test('Aave Ethereum pools resolve individually, with the exact underlying token', () => {
  for (const [pool, slug] of [
    ['0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2', 'proto_mainnet_v3'],
    ['0x4e033931ad43597d96D6bcc25c280717730B58B1', 'proto_lido_v3'],
    ['0x0AA97c284e98396202b6A04024F5E2c65026F3c0', 'proto_etherfi_v3'],
    ['0xAe05Cd22df81871bc7cC2a04BeCfb516bFe332C8', 'proto_horizon_v3'],
  ]) {
    const url = new URL(aaveV3MarketUrl(1, pool.toLowerCase(), token)!);
    assert.equal(url.searchParams.get('underlyingAsset'), token);
    assert.equal(url.searchParams.get('marketName'), slug);
    assert.equal(url.pathname, '/reserve-overview/');
  }
});
test('Aave pool address reused across chains does not select the wrong network', () => {
  const pool = '0x794a61358D6845594F94dc1DB02A252b5b4814aD';
  for (const [chain, slug] of [
    [10, 'optimism'],
    [137, 'polygon'],
    [42161, 'arbitrum'],
    [43114, 'avalanche'],
  ] as const) {
    assert.equal(
      new URL(aaveV3MarketUrl(chain, pool, token)!).searchParams.get('marketName'),
      `proto_${slug}_v3`,
    );
  }
  assert.equal(aaveV3MarketUrl(1, pool, token), undefined);
});
test('Aave V4 preserves the complete chain/spoke/reserve identifier including base64 padding', () => {
  const id = Buffer.from('43114::0x435272CefF93a1E657E8ABfdf0A13e95900A3a56::5').toString('base64');
  const url = new URL(aaveV4MarketUrl(id)!);
  assert.equal(url.origin, 'https://pro.aave.com');
  assert.equal(decodeURIComponent(url.pathname.replace('/explore/reserve/', '')), id);
});
test('Morpho uses official slugs, not network display labels', () => {
  const slugs = {
    1: 'ethereum',
    8453: 'base',
    42161: 'arbitrum',
    10: 'opmainnet',
    4217: 'tempo',
    4663: 'robinhood-chain',
    999: 'hyperevm',
    747474: 'katana',
    143: 'monad',
    988: 'stable',
    137: 'polygon',
    130: 'unichain',
  };
  for (const [chain, slug] of Object.entries(slugs))
    assert.equal(morphoMarketUrl(Number(chain), hash), `https://app.morpho.org/${slug}/market/${hash}`);
});
test('Unverified routes and malformed identifiers never link to a guessed market', () => {
  assert.equal(aaveV3MarketUrl(1, '0xunknown', token), undefined);
  assert.equal(aaveV4MarketUrl(''), undefined);
  assert.equal(aaveV4MarketUrl('../wrong'), undefined);
  assert.equal(morphoMarketUrl(999999, hash), undefined);
  assert.equal(morphoMarketUrl(5042, hash), undefined); // API-listed, not in official app
  assert.equal(morphoMarketUrl(1, token), undefined);
});
test('Previously cached generic or wrong source URLs are recomputed by exact identity', () => {
  const cached = {
    protocol: 'Morpho',
    chainId: 42161,
    address: hash,
    sourceUrl: 'https://app.morpho.org/arbitrum-one/market/wrong',
  } as Market;
  assert.equal(marketUrl(cached), `https://app.morpho.org/arbitrum/market/${hash}`);
});
