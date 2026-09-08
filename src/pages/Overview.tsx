import { ArrowRight } from 'lucide-react';
import type { Market } from '../../shared/types';
import LiquidAssetComparison from '../components/LiquidAssetComparison';
import ProtocolOverview from '../components/ProtocolOverview';

import { MarketTable } from '../components/MarketTable';
import { num } from '../lib/format';
import { type View } from '../lib/navigation';

export function Overview({
  markets,
  onHistory,
  navigate,
}: {
  markets: Market[];
  onHistory: (id: string) => void;
  navigate: (v: View) => void;
}) {
  return (
    <>
      <ProtocolOverview markets={markets} chain="all" />
      <div className="section-heading live-markets-heading">
        <div>
          <span className="eyebrow">THE LENDING BENCHMARK</span>
          <h2>Aave vs. Morpho, asset by asset</h2>
          <p>Latest reported rates · compare borrowing demand, lending yields and the markets behind them.</p>
        </div>
      </div>
      <LiquidAssetComparison markets={markets} onHistory={onHistory} />
      <div className="section-heading market-table-heading">
        <div>
          <h2>
            Explore the markets <span className="count-badge">{num(markets.length)}</span>
          </h2>
          <p>Individual lending reserves and isolated markets, with their own liquidity and caps.</p>
        </div>
        <button className="text-button" onClick={() => navigate('opportunities')}>
          Explore looping <ArrowRight size={15} />
        </button>
      </div>
      <MarketTable markets={markets} onHistory={onHistory} />
    </>
  );
}
