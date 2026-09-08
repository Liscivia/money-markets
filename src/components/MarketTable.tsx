import { ArrowDown, ArrowDownUp, ChevronLeft, ChevronRight, LineChart as LineChartIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { EMPTY_MARKET_FILTERS, filterMarkets, type MarketFilters } from '../../shared/overview';
import type { Market } from '../../shared/types';

import { Empty, MarketLink, ProtocolBadge } from '../components/ui';
import { num, pct, usd } from '../lib/format';

export function MarketTable({ markets, onHistory }: { markets: Market[]; onHistory: (id: string) => void }) {
  const [sort, setSort] = useState<keyof Market>('totalSupplyUsd');
  const [ascending, setAscending] = useState(false);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<MarketFilters>({ ...EMPTY_MARKET_FILTERS });
  const visible = useMemo(() => filterMarkets(markets, filters), [markets, filters]);
  const options = useMemo(
    () => ({
      assets: [...new Set(markets.map((m) => m.asset.symbol))].sort(),
      chains: [...new Set(markets.map((m) => m.chain))].sort(),
    }),
    [markets],
  );
  function updateFilter<K extends keyof MarketFilters>(key: K, value: MarketFilters[K]) {
    setFilters((previous) => ({ ...previous, [key]: value }));
    setPage(0);
  }
  const size = 10;
  useEffect(() => setPage(0), [markets]);
  const sorted = useMemo(
    () =>
      [...visible].sort((a, b) => {
        const av = a[sort],
          bv = b[sort];
        if (av == null) return 1;
        if (bv == null) return -1;
        return (Number(av) - Number(bv)) * (ascending ? 1 : -1);
      }),
    [visible, sort, ascending],
  );
  function changeSort(k: keyof Market) {
    if (sort === k) setAscending(!ascending);
    else {
      setSort(k);
      setAscending(false);
    }
    setPage(0);
  }
  const th = (label: string, k: keyof Market) => (
    <th>
      <button className={sort === k ? 'sorted' : ''} onClick={() => changeSort(k)}>
        {label}
        {sort === k ? (
          <ArrowDown size={12} style={{ transform: ascending ? 'rotate(180deg)' : undefined }} />
        ) : (
          <ArrowDownUp size={11} />
        )}
      </button>
    </th>
  );
  return (
    <div className="panel market-panel">
      <div className="market-table-filters">
        <label>
          Asset
          <select
            aria-label="Table asset filter"
            value={filters.asset}
            onChange={(e) => updateFilter('asset', e.target.value)}
          >
            <option value="all">All assets</option>
            {options.assets.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label>
          Protocol
          <select
            aria-label="Table protocol filter"
            value={filters.protocol}
            onChange={(e) => updateFilter('protocol', e.target.value)}
          >
            <option value="all">Both protocols</option>
            <option>Aave</option>
            <option>Morpho</option>
          </select>
        </label>
        <label>
          Network
          <select
            aria-label="Table network filter"
            value={filters.chain}
            onChange={(e) => updateFilter('chain', e.target.value)}
          >
            <option value="all">All networks</option>
            {options.chains.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Min. available ($M)
          <input
            aria-label="Table minimum available liquidity in millions"
            type="number"
            min="0"
            step="1"
            value={filters.minLiquidityUsd / 1e6 || ''}
            placeholder="Any size"
            onChange={(e) => updateFilter('minLiquidityUsd', Math.max(0, Number(e.target.value) || 0) * 1e6)}
          />
        </label>
        <label className="table-search-filter">
          Find a market
          <input
            aria-label="Table market search"
            value={filters.search}
            placeholder="Token, collateral, V3 / V4 or ID"
            onChange={(e) => updateFilter('search', e.target.value)}
          />
        </label>
        <button
          className="text-button"
          onClick={() => {
            setFilters({ ...EMPTY_MARKET_FILTERS });
            setPage(0);
          }}
        >
          Reset
        </button>
      </div>
      <div className="table-filter-summary">
        <span>
          {num(visible.length)} of {num(markets.length)} markets in the overview selection
        </span>
        <span>These filters affect this table only. Available = reserve cash, before caps.</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Market / asset</th>
              <th>Protocol</th>
              <th>Network</th>
              {th('Supply APY', 'supplyApy')}
              {th('Borrow APY', 'borrowApy')}
              {th('Supplied', 'totalSupplyUsd')}
              {th('Available', 'liquidityUsd')}
              {th('Utilization', 'utilization')}
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.slice(page * size, (page + 1) * size).map((m) => (
              <tr key={m.id}>
                <td>
                  <div className="asset-cell">
                    <span className="asset-symbol">{m.asset.symbol.slice(0, 2)}</span>
                    <span>
                      <strong>{m.asset.symbol}</strong>
                      <small title={m.name}>
                        {m.protocol === 'Morpho'
                          ? `${m.collateral[0]?.asset.symbol ?? 'Unknown'} collateral · ${m.lltv ? pct(m.lltv, 0) : '—'} LLTV`
                          : m.name}
                      </small>
                      {(m.isPaused || m.isFrozen || !m.borrowingEnabled) && (
                        <small className="warn-text">
                          {m.isPaused ? 'Paused' : m.isFrozen ? 'Frozen' : 'Borrow disabled'}
                        </small>
                      )}
                    </span>
                  </div>
                </td>
                <td>
                  <ProtocolBadge small protocol={m.protocol} />
                </td>
                <td>
                  <span className="network-name">{m.chain}</span>
                </td>
                <td>
                  <strong className="positive">{pct(m.supplyApy)}</strong>
                  {m.supplyRewardApr > 0 && (
                    <small className="reward-text">+{pct(m.supplyRewardApr)} rewards APR</small>
                  )}
                </td>
                <td>
                  <strong>{pct(m.borrowApy)}</strong>
                  {m.borrowRewardApr > 0 && (
                    <small className="reward-text">{pct(m.borrowRewardApr)} incentive APR</small>
                  )}
                </td>
                <td>{usd(m.totalSupplyUsd)}</td>
                <td>{usd(m.liquidityUsd)}</td>
                <td>
                  <div className="util-cell">
                    <span>{pct(m.utilization, 1)}</span>
                    <div>
                      <i
                        style={{
                          width: `${Math.min(m.utilization * 100, 100)}%`,
                          background: m.utilization > 0.9 ? '#e8ba7c' : '#75859d',
                        }}
                      />
                    </div>
                  </div>
                </td>
                <td>
                  <button
                    className="table-action icon-button"
                    title={`View ${m.name} rate history`}
                    aria-label={`View ${m.protocol} ${m.asset.symbol} rate history`}
                    onClick={() => onHistory(m.id)}
                  >
                    <LineChartIcon size={17} />
                  </button>
                  <MarketLink market={m} compact />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!visible.length && (
        <Empty title="No matching markets" detail="Try a different asset, network, or protocol." />
      )}
      <div className="pagination">
        <span>
          {visible.length
            ? `${page * size + 1}–${Math.min((page + 1) * size, visible.length)} of ${num(visible.length)} markets`
            : '0 markets'}
          <span className="pagination-note"> · Organic rates, excluding rewards</span>
        </span>
        <div>
          <button
            className="icon-button"
            aria-label="Previous market page"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft size={17} />
          </button>
          <span>
            {page + 1} / {Math.max(1, Math.ceil(markets.length / size))}
          </span>
          <button
            className="icon-button"
            aria-label="Next market page"
            disabled={(page + 1) * size >= visible.length}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
