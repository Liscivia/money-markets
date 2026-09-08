import { groupCollateral } from '../../shared/market-details';
import type { CollateralCap, CollateralDetail, Market } from '../../shared/types';
import InfoTile from './InfoTile';

const money = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? 'Unknown'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: 'compact',
        maximumFractionDigits: 2,
      }).format(n);
const percent = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? 'Unknown' : `${(n * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
const units = (n: number | null, symbol: string) =>
  n === null
    ? 'Unknown'
    : `${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 3 }).format(n)} ${symbol}`;
const value = (usd: number | null, tokens: number | null, symbol: string) =>
  usd === null ? units(tokens, symbol) : money(usd);

function CapLine({ cap, symbol, morpho }: { cap: CollateralCap; symbol: string; morpho: boolean }) {
  if (cap.status === 'uncapped')
    return <span>{morpho ? 'No protocol collateral cap' : 'Supply cap: uncapped'}</span>;
  if (cap.status === 'unknown') return <span>Supply cap: not reported</span>;
  return (
    <span>
      Supply cap:{' '}
      <b>
        {value(cap.usedUsd, cap.usedTokens, symbol)} / {value(cap.limitUsd, cap.limitTokens, symbol)}
      </b>
      {cap.usedRatio !== null && <> · {percent(cap.usedRatio)} used</>}
    </span>
  );
}
function RiskLine({
  detail,
  version,
  morpho,
}: {
  detail: CollateralDetail;
  version: string;
  morpho: boolean;
}) {
  return (
    <div className="collateral-risk-line">
      <span>{detail.mode}</span>
      <b>
        {morpho
          ? `LLTV ${percent(detail.liquidationThreshold)}`
          : version === 'V4'
            ? `Collateral factor ${percent(detail.liquidationThreshold)}`
            : `LTV ${percent(detail.ltv)} / liq. ${percent(detail.liquidationThreshold)}`}
      </b>
    </div>
  );
}

export default function MarketDetails({ market }: { market: Market }) {
  const groups = groupCollateral(market.collateralDetails ?? []);
  const morpho = market.protocol === 'Morpho';
  const utilization = Number.isFinite(market.utilization) ? market.utilization : null;
  const target = market.rateModel?.optimalUtilization;
  return (
    <section
      className="selected-market-details"
      aria-label={`${market.protocol} ${market.asset.symbol} market details`}
    >
      <dl className="market-detail-facts">
        <div>
          <dt>Debt asset</dt>
          <dd>
            <strong title={market.asset.address}>{market.asset.symbol}</strong>
            <small>
              {market.chain} · {market.version}
            </small>
          </dd>
        </div>
        <div>
          <dt>
            Available liquidity
            <InfoTile title="Available market liquidity">
              <p>
                Unborrowed loan-asset cash reported by the API, before borrow caps and position-specific
                eligibility. This is not TVL and does not include Morpho borrower collateral or Public
                Allocator reallocations.
              </p>
              <p>
                Aave V4 cash is shared across the hub's spokes; it is not owned by this reserve alone.
                Screened headroom also applies the reserve/spoke cap and source restrictions; it is not a
                guaranteed executable size.
              </p>
              <p>Snapshot: {market.fetchedAt}</p>
            </InfoTile>
          </dt>
          <dd>
            <strong>{money(market.liquidityUsd)}</strong>
            <small>Screened borrow headroom {money(market.borrowCapacityUsd)}</small>
            {market.version === 'V4' && <small>Shared hub cash</small>}
          </dd>
        </div>
        <div>
          <dt>
            Utilization
            <InfoTile title="Market utilization">
              <p>
                The protocol-reported borrowed fraction of its lending liquidity. The denominator is 100%; the
                optional target/kink is the rate-model threshold, not another utilization estimate.
              </p>
              <p>
                Aave V4 reports shared hub-asset utilization. Other markets report reserve/market utilization.
                This is not collateral supply-cap usage; those percentages appear beside each collateral.
              </p>
            </InfoTile>
          </dt>
          <dd>
            <strong>
              {percent(utilization)} <em>/ 100%</em>
            </strong>
            {target !== undefined && <small>Rate-model target / kink {percent(target)}</small>}
            <div className="market-utilization-track" aria-hidden="true">
              <span style={{ width: `${Math.max(0, Math.min(1, utilization ?? 0)) * 100}%` }} />
            </div>
          </dd>
        </div>
      </dl>
      <div className="collateral-detail-heading">
        <div>
          <h3>
            Enabled collateral{' '}
            <span>
              {groups.length} {groups.length === 1 ? 'asset' : 'assets'}
            </span>
          </h3>
          <p>Protocol configuration · conditions apply per mode</p>
        </div>
        <InfoTile title="Collateral limits and caps">
          <p>
            <b>LTV / liquidation threshold</b> means the maximum borrowing ratio at entry and the ratio at
            which a position becomes liquidatable. These percentages are not dollar supply caps. Morpho
            exposes LLTV; Aave V4 exposes a collateral factor rather than a separate V3-style LTV pair.
          </p>
          <p>
            <b>Supply cap: used / limit (% used)</b> is the total collateral-token reserve supply versus its
            configured amount limit. Usage is calculated in native token units; USD values use the source
            price. Existing interest can push usage over 100%. Room is the API's available new supply
            headroom, not a per-wallet allowance.
          </p>
          <p>
            Aave eMode rows appear only when this debt asset is borrowable in the same category. Isolation
            requires a permitted debt asset, only one collateral and a shared debt ceiling. Frozen/paused or
            capped configurations stay visible with restrictions. Permissioned wallet eligibility is not
            verified.
          </p>
          <p>
            Morpho Blue has one collateral per market and no protocol collateral amount cap; vault allocation
            caps are a different constraint. The display is broader than our conservative opportunity
            screening and does not enable additional routes.
          </p>
          <p>
            <a
              href="https://aave.com/help/supplying/isolation-mode"
              target="_blank"
              rel="noopener noreferrer"
            >
              Aave isolation rules
            </a>{' '}
            ·{' '}
            <a href="https://docs.morpho.org/learn/concepts/blue/" target="_blank" rel="noopener noreferrer">
              Morpho market parameters
            </a>
          </p>
        </InfoTile>
      </div>
      {market.collateralDetails === undefined ? (
        <p className="market-details-note">
          Detailed collateral limits are not in this cached snapshot yet. Refresh market data to load them; no
          caps are assumed.
        </p>
      ) : !groups.length ? (
        <p className="market-details-note">
          No eligible collateral configuration reported for this debt asset
          {market.borrowApy === null ? ' (no borrowing leg)' : ''}.
        </p>
      ) : (
        <div
          className="collateral-detail-list"
          tabIndex={0}
          role="region"
          aria-label={`All ${groups.length} enabled collateral assets for ${market.protocol} ${market.asset.symbol}`}
        >
          {groups.map((group) => {
            const primary = group.details.find((d) => d.mode === 'Standard') ?? group.details[0];
            const rest = group.details.filter((d) => d !== primary);
            const warnings = [...new Set(group.details.flatMap((d) => d.restrictions))];
            return (
              <article className="collateral-detail-item" key={group.asset.address}>
                <div className="collateral-asset-title">
                  <strong title={group.asset.address}>{group.asset.symbol}</strong>
                  <code title={group.asset.address}>
                    {group.asset.address.slice(0, 6)}…{group.asset.address.slice(-4)}
                  </code>
                  {!primary.newSupplyEnabled && (
                    <span className="collateral-blocked">New supply blocked / unverified</span>
                  )}
                </div>
                <RiskLine detail={primary} morpho={morpho} version={market.version} />
                {rest.length > 0 && (
                  <details className="collateral-extra-modes">
                    <summary>
                      {rest.length} additional {rest.length === 1 ? 'mode' : 'modes'} for this debt asset
                    </summary>
                    {rest.map((d) => (
                      <RiskLine key={d.mode} detail={d} morpho={morpho} version={market.version} />
                    ))}
                  </details>
                )}
                <div className="collateral-cap-line">
                  <CapLine cap={primary.supplyCap} symbol={group.asset.symbol} morpho={morpho} />
                  {primary.supplyCap.status === 'capped' && (
                    <span>
                      New supply room: <b>{money(primary.supplyHeadroomUsd)}</b>
                    </span>
                  )}
                </div>
                {primary.isolationDebt && (
                  <p className="collateral-isolation-ceiling">
                    Isolation debt:{' '}
                    <b>
                      {money(primary.isolationDebt.usedUsd)} / {money(primary.isolationDebt.ceilingUsd)}
                    </b>
                    {primary.isolationDebt.usedUsd !== null &&
                      primary.isolationDebt.ceilingUsd !== null &&
                      primary.isolationDebt.ceilingUsd > 0 && (
                        <>
                          {' '}
                          · {percent(primary.isolationDebt.usedUsd / primary.isolationDebt.ceilingUsd)} used
                        </>
                      )}
                  </p>
                )}
                {warnings.length > 0 && <p className="collateral-restrictions">{warnings.join(' ')}</p>}
              </article>
            );
          })}
        </div>
      )}
      {!market.borrowingEnabled && (
        <p className="market-details-note">
          New borrowing is unavailable or excluded from screening. Configuration shown above is not a borrow
          approval.{market.isFrozen ? ' Selected reserve is frozen.' : ''}
          {market.isPaused ? ' Selected reserve is paused.' : ''}
        </p>
      )}
    </section>
  );
}
