import type { ReactNode } from 'react';
import type { Opportunity } from '../../shared/types';
import InfoTile from './InfoTile';

const money = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
const percent = (value: number | null) => (value === null ? 'Not modeled' : `${(value * 100).toFixed(2)}%`);

export function OpportunityLabel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="opportunity-label">
      <span>{title}</span>
      <InfoTile title={title}>{children}</InfoTile>
    </div>
  );
}

export function leverageLimitLabel(op: Opportunity) {
  switch (op.leveragePolicy.limitingFactor) {
    case 'health-factor':
      return `HF ${op.leveragePolicy.minHealthFactor.toFixed(2)} buffer`;
    case 'protocol-ltv':
      return 'Protocol LTV buffer';
    case 'screen-ltv':
      return '95% screen LTV ceiling';
    default:
      return 'Requested target reached';
  }
}

export function LeverageInfo({ op }: { op: Opportunity }) {
  const { requested, minHealthFactor, protocolMaxLtv } = op.leveragePolicy;
  return (
    <OpportunityLabel title={op.type === 'native-loop' ? 'Applied leverage' : 'Gross assets / equity'}>
      <p>
        {op.type === 'native-loop'
          ? `${requested.toFixed(2)}× requested → ${op.leverage.toFixed(2)}× applied. ${leverageLimitLabel(op)}. The screen caps leverage for collateral risk; it does not search for a profit-maximizing leverage.`
          : `This is not a recursive loop. Separately posted collateral stays at the borrowing venue; the borrowed token is lent elsewhere. Gross assets / equity = 1 + LTV = ${op.leverage.toFixed(2)}×. The loop target only sets an upper bound on borrowing LTV.`}
      </p>
      <p>
        Allowed LTV is the lowest of the requested LTV ({percent(1 - 1 / requested)}), 98% of the protocol
        limit ({percent(protocolMaxLtv * 0.98)}), liquidation threshold / minimum HF (
        {percent(op.liquidationThreshold / minHealthFactor)}), and the screen's 95% ceiling.
      </p>
      <p>
        Applied LTV: {percent(op.targetLtv)}. HF = {percent(op.liquidationThreshold)} /{' '}
        {percent(op.targetLtv)} = {op.healthFactor.toFixed(2)}. For a native loop, leverage = 1 / (1 − LTV).
      </p>
      <p>
        {op.leveragePolicy.collateralMode}. The HF floor is a research assumption, not a guarantee against
        liquidation.
      </p>
      <a
        href={
          op.borrowProtocol === 'Aave'
            ? 'https://aave.com/help/borrowing/liquidations'
            : 'https://docs.morpho.org/learn/concepts/blue/'
        }
        target="_blank"
        rel="noreferrer"
      >
        Protocol risk methodology ↗
      </a>
    </OpportunityLabel>
  );
}

export function OpportunityBreakdown({ op, actions }: { op: Opportunity; actions?: ReactNode }) {
  const isLoop = op.type === 'native-loop';
  const modeled = op.modeledNetReturnOnEquity !== null;
  const returnOnEquity = op.modeledNetReturnOnEquity ?? op.netReturnOnEquity;
  const effectiveBorrow = modeled ? op.modeledBorrowApr : op.borrowApr;
  const effectiveLend = modeled ? op.modeledLendingApr : op.lendingApr;
  const spread =
    effectiveBorrow !== null && effectiveLend !== null
      ? (isLoop ? op.nativeApr : 0) + effectiveLend - effectiveBorrow
      : null;
  return (
    <div className="opportunity-detail">
      <div className="position-flow">
        <div>
          <OpportunityLabel title="Your equity">
            <p>
              Your own capital, excluding borrowing.{' '}
              {isLoop
                ? 'Equity = debt / (applied leverage − 1).'
                : 'All of this equity is posted as collateral. Equity = debt / LTV.'}{' '}
              The debt input stays fixed; changing leverage changes the equity required.
            </p>
          </OpportunityLabel>
          <strong>{money(op.equityUsd)}</strong>
          <small>{isLoop ? 'Capital you put in' : `${op.collateralSymbol} posted as collateral`}</small>
        </div>
        <span className="position-operator">+</span>
        <div>
          <OpportunityLabel title={isLoop ? 'Borrowed capital' : 'Borrowed and lent elsewhere'}>
            <p>
              {money(op.debtUsd)} of {op.debtSymbol} debt.{' '}
              {isLoop
                ? `Used to acquire more ${op.collateralSymbol} and redeposit it as collateral.`
                : `The same ${op.debtSymbol} is lent on ${op.lendProtocol}. That lending receipt is not pledged back to the borrowing venue.`}
            </p>
          </OpportunityLabel>
          <strong>{money(op.debtUsd)}</strong>
          <small>
            {op.debtSymbol}
            {isLoop ? ` → ${op.collateralSymbol}` : ` → ${op.lendProtocol}`}
          </small>
        </div>
        <span className="position-operator">=</span>
        <div>
          <OpportunityLabel title={isLoop ? 'Total posted collateral' : 'Total gross assets'}>
            <p>
              {isLoop
                ? `The full ${op.collateralSymbol} position backing the loan: your equity plus reinvested debt. It is not extra equity and does not mean this much cash is available to withdraw.`
                : `${money(op.collateralUsd)} of separately posted ${op.collateralSymbol} collateral + ${money(op.externalSupplyUsd)} of external lending. Only the first amount backs the borrowing position; gross assets are not all collateral.`}
            </p>
          </OpportunityLabel>
          <strong>{money(isLoop ? op.collateralUsd : op.exposureUsd)}</strong>
          <small>{isLoop ? `${op.leverage.toFixed(2)}× your equity` : 'Collateral + external lending'}</small>
        </div>
      </div>
      <div className="leverage-explanation">
        <div>
          <strong>
            {isLoop
              ? `${op.leveragePolicy.requested.toFixed(2)}× requested → ${op.leverage.toFixed(2)}× applied`
              : 'Separate collateral, no recursive leverage'}
          </strong>
          <p>
            {isLoop
              ? `${leverageLimitLabel(op)}. This is a risk ceiling, not a profitability ceiling.`
              : `Posted collateral: ${money(op.collateralUsd)}. External lending: ${money(op.externalSupplyUsd)}. Gross assets / equity: ${op.leverage.toFixed(2)}×.`}
          </p>
        </div>
        <LeverageInfo op={op} />
      </div>
      <div className="detail-metrics opportunity-economics">
        <div>
          <OpportunityLabel title="Native token APR">
            <p>
              Yield accruing inside {op.collateralSymbol}, independent of Aave or Morpho lending. No campaign
              rewards or points are included. Native yield is held constant in the size stress.
            </p>
          </OpportunityLabel>
          <strong>{percent(op.nativeApr)}</strong>
        </div>
        <div>
          <OpportunityLabel title={isLoop ? 'Collateral lending APR' : 'External lending APR'}>
            <p>
              {isLoop
                ? 'Additional interest on the posted collateral. Aave may pay reserve interest; Morpho Blue collateral is not lent out and earns zero protocol interest.'
                : 'Interest on the same token borrowed and supplied to the destination. Adding your deposit can dilute the lending rate.'}{' '}
              {modeled
                ? 'After the selected size, where modeled.'
                : 'Current rate; size impact is not fully modeled.'}
            </p>
          </OpportunityLabel>
          <strong>{percent(effectiveLend)}</strong>
        </div>
        <div>
          <OpportunityLabel title="Borrow APR at size">
            <p>
              The immediate borrowing rate after adding {money(op.debtUsd)} of debt, using the indexed
              utilization curve. This is a rate stress, not an execution quote or a forecast.
            </p>
          </OpportunityLabel>
          <strong>{percent(op.modeledBorrowApr)}</strong>
          <small>Current: {percent(op.borrowApr)}</small>
        </div>
        <div>
          <OpportunityLabel title="Incremental spread">
            <p>
              {isLoop
                ? 'Native token APR + collateral lending APR − borrow APR.'
                : 'External lending APR − borrow APR; excludes income on your separately posted collateral.'}{' '}
              This must stay positive to qualify when size impact is modeled.{' '}
              {modeled
                ? 'Shown after the selected size.'
                : 'Current rates only; size impact is not fully modeled.'}
            </p>
          </OpportunityLabel>
          <strong>{percent(spread)}</strong>
        </div>
        <div>
          <OpportunityLabel title="Debt / collateral">
            <p>
              LTV = debt divided by posted collateral. Current scenario: {money(op.debtUsd)} /{' '}
              {money(op.collateralUsd)}. Liquidation threshold: {percent(op.liquidationThreshold)}; indexed
              protocol admission limit: {percent(op.leveragePolicy.protocolMaxLtv)}.
            </p>
          </OpportunityLabel>
          <strong>{percent(op.targetLtv)}</strong>
          <small>Liquidation at {percent(op.liquidationThreshold)}</small>
        </div>
        <div>
          <OpportunityLabel title="Annual financing-net income">
            <p>
              Return on equity × your equity at {modeled ? 'size-stressed' : 'current'} rates. Deducts
              borrowing interest, but not gas, slippage, fees or losses. Not a guaranteed payout or compounded
              APY.
            </p>
          </OpportunityLabel>
          <strong>{money(returnOnEquity * op.equityUsd)}</strong>
          <small>{percent(returnOnEquity)} on your equity</small>
        </div>
      </div>
      <div className="detail-bottom">
        <div className="opportunity-caveats">
          <p>
            Organic rates only. Swap depth, execution costs and entry/exit routes are not verified. Shared
            market capacity cannot be added across rows.
          </p>
          <details>
            <summary>Model assumptions and sources</summary>
            {op.assumptions.map((note, i) => (
              <p key={i}>{note}</p>
            ))}
          </details>
          {op.exclusionReasons.map((note, i) => (
            <p className="warn-text" key={i}>
              {note}
            </p>
          ))}
        </div>
        <div className="detail-actions">{actions}</div>
      </div>
    </div>
  );
}
