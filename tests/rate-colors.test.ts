import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { LineChart } from 'lucide-react';
import { Metric } from '../src/components/ui.js';
import type { Protocol } from '../shared/types.js';

test('Current cards follow protocol identity for either order and same-protocol comparisons', () => {
  for (const pair of [
    ['Aave', 'Morpho'],
    ['Morpho', 'Aave'],
    ['Morpho', 'Morpho'],
    ['Aave', 'Aave'],
  ] as Protocol[][]) {
    const html = renderToStaticMarkup(
      createElement(
        'div',
        {},
        ...pair.map((protocol, index) =>
          createElement(Metric, {
            key: index,
            protocol,
            label: `${index} CURRENT`,
            value: index ? '7.00%' : '1.00%',
            detail: protocol,
            icon: LineChart,
          }),
        ),
      ),
    );
    assert.deepEqual(
      [...html.matchAll(/class="metric-card metric-(aave|morpho)"/g)].map((match) => match[1]),
      pair.map((protocol) => protocol.toLowerCase()),
    );
    assert.ok(!html.includes('accent'));
  }
});

test('Gap and advantage cards remain neutral; Rates passes actual selections, not fixed position colors', () => {
  const html = renderToStaticMarkup(
    createElement(Metric, {
      label: 'GAP',
      value: '-46 bps',
      detail: 'A minus B',
      icon: LineChart,
    }),
  );
  assert.match(html, /class="metric-card"/);
  const source = readFileSync(new URL('../src/pages/Rates.tsx', import.meta.url), 'utf8');
  assert.match(source, /protocol=\{marketA\?\.protocol\}/);
  assert.match(source, /protocol=\{marketB\?\.protocol\}/);
  assert.ok(!source.includes('stroke={COLORS.Aave}') && !source.includes('stroke={COLORS.Morpho}'));
  assert.match(source, /strokeDasharray=\{marketA\?\.protocol === marketB\?\.protocol/);
});
