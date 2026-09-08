import { XMLParser } from 'fast-xml-parser';
import type { NewsItem, NewsResult, Protocol } from '../shared/types.js';

const sources: { protocol: Protocol; base: string }[] = [
  { protocol: 'Aave', base: 'https://governance.aave.com' },
  { protocol: 'Morpho', base: 'https://forum.morpho.org' },
];
export function plainText(input: unknown): string {
  return String(input ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
function category(title: string) {
  if (/risk|cap |caps|interest rate|IRM|collateral|offboard|deprecat|liquidat/i.test(title))
    return 'Risk & rates';
  if (/launch|deploy|onboard|new market|listing|whitelist|expansion/i.test(title)) return 'Markets & growth';
  if (/budget|funding|grant|incentive|reward|treasury|revenue/i.test(title)) return 'Economics';
  if (/update|development|roadmap|upgrade|v4|vault v2/i.test(title)) return 'Protocol updates';
  return 'Governance';
}
async function request(url: string) {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(18_000),
    headers: {
      Accept: 'application/json, application/rss+xml',
      'User-Agent': 'MoneyMarkets/1.0 (public governance research)',
    },
  });
  if (!r.ok) throw new Error(`Source returned HTTP ${r.status}`);
  return r;
}
export async function fetchNews(): Promise<NewsResult> {
  const fetchedAt = new Date().toISOString();
  const results = await Promise.all(
    sources.map(async ({ protocol, base }) => {
      try {
        const rss = await request(`${base}/latest.rss`).then((r) => r.text());
        const parsed = new XMLParser({ ignoreAttributes: true, processEntities: true }).parse(rss);
        const raw = parsed?.rss?.channel?.item;
        const entries: Record<string, unknown>[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
        const items: NewsItem[] = entries.flatMap((entry) => {
          const url = String(entry.link ?? '');
          if (!url.startsWith(`${base}/`)) return [];
          const date = new Date(String(entry.pubDate));
          if (!Number.isFinite(date.getTime())) return [];
          const title = plainText(entry.title);
          return [
            {
              id: `${protocol}:${url}`,
              protocol,
              title,
              url,
              publishedAt: date.toISOString(),
              excerpt: plainText(entry.description).slice(0, 360),
              category: category(title),
              source: `${protocol} Governance`,
            },
          ];
        });
        if (!items.length) throw new Error('Source returned no readable topics');
        return { items, source: { protocol, url: `${base}/latest.rss`, status: 'live' } };
      } catch {
        try {
          const data = (await request(`${base}/latest.json`).then((r) => r.json())) as {
            topic_list?: { topics?: Array<Record<string, unknown>> };
          };
          const items: NewsItem[] = (data.topic_list?.topics ?? []).flatMap((t) => {
            const date = new Date(String(t.created_at));
            if (!Number.isFinite(date.getTime())) return [];
            const title = plainText(t.title);
            return [
              {
                id: `${protocol}:${t.id}`,
                protocol,
                title,
                url: `${base}/t/${t.slug}/${t.id}`,
                publishedAt: date.toISOString(),
                excerpt: plainText(t.excerpt),
                category: category(title),
                source: `${protocol} Governance`,
                replies: Number(t.reply_count ?? 0),
              },
            ];
          });
          if (!items.length) throw new Error('Source returned no readable topics');
          return { items, source: { protocol, url: `${base}/latest.json`, status: 'live' } };
        } catch (e) {
          return {
            items: [],
            source: {
              protocol,
              url: base,
              status: 'error',
              error: e instanceof Error ? e.message : 'Source unavailable',
            },
          };
        }
      }
    }),
  );
  return {
    items: results.flatMap((r) => r.items).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
    sources: results.map((r) => r.source),
    fetchedAt,
  };
}
