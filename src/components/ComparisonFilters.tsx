import { ChevronDown } from 'lucide-react';
import {
  comparisonFilters,
  comparisonOptions,
  updateComparisonFilter,
  type ComparisonFilters as Filters,
} from '../../shared/comparison';
import type { Market } from '../../shared/types';

export default function ComparisonFilters({
  markets,
  filters,
  onChange,
  index,
}: {
  markets: Market[];
  filters: Filters;
  onChange: (filters: Filters) => void;
  index: number;
}) {
  const options = comparisonOptions(markets, filters);
  const prefix = index === 0 ? 'First' : 'Second';
  const fields = [
    {
      key: 'protocol',
      label: 'Protocol',
      options: [
        { value: 'Aave', label: 'Aave' },
        { value: 'Morpho', label: 'Morpho' },
      ],
    },
    {
      key: 'network',
      label: 'Network',
      options: [{ value: 'all', label: 'All networks' }, ...options.networks],
    },
    {
      key: 'debtAsset',
      label: 'Debt asset',
      options: [{ value: 'all', label: 'All debt assets' }, ...options.debtAssets],
    },
    {
      key: 'collateralAsset',
      label: 'Collateral asset',
      options: [{ value: 'all', label: 'All collateral assets' }, ...options.collateralAssets],
    },
  ] as const;
  return (
    <>
      <div className="comparison-filters">
        {fields.map((field) => (
          <label key={field.key}>
            {field.label}
            <div className="market-select-control">
              <select
                aria-label={`${prefix} market ${field.label.toLowerCase()} filter`}
                value={filters[field.key]}
                onChange={(e) =>
                  onChange(
                    updateComparisonFilter(filters, field.key, e.target.value as Filters[typeof field.key]),
                  )
                }
              >
                {!field.options.some((option) => option.value === filters[field.key]) && (
                  <option value={filters[field.key]}>Selection no longer listed</option>
                )}
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </div>
          </label>
        ))}
      </div>
      <button
        className="text-button comparison-reset"
        onClick={() => onChange(comparisonFilters(filters.protocol))}
      >
        Reset {prefix.toLowerCase()} filters
      </button>
    </>
  );
}
