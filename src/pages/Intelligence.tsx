import {
  ArrowUpRight,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  Newspaper,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { NewsResult } from '../../shared/types';

import { Empty, ErrorNotice, Loading, ProtocolBadge } from '../components/ui';
import { api } from '../lib/api';
import { date } from '../lib/format';

export function Intelligence() {
  const [data, setData] = useState<NewsResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [protocol, setProtocol] = useState('all');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [period, setPeriod] = useState('all');
  async function load(refresh = false) {
    setLoading(true);
    setError('');
    try {
      setData(await api<NewsResult>(refresh ? '/api/news?refresh=1' : '/api/news'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const categories = [...new Set(data?.items.map((i) => i.category) ?? [])].sort();
  const items = (data?.items ?? []).filter(
    (i) =>
      (protocol === 'all' || i.protocol === protocol) &&
      (category === 'all' || i.category === category) &&
      (period === 'all' || Date.now() - Date.parse(i.publishedAt) <= Number(period) * 86400000) &&
      (!query || `${i.title} ${i.excerpt}`.toLowerCase().includes(query.toLowerCase())),
  );
  return (
    <>
      <div className="intelligence-intro">
        <div>
          <span className="eyebrow">DIRECT FROM THE SOURCE</span>
          <h2>A pulse on both ecosystems.</h2>
          <p>Official governance discussions and public updates, together in one feed.</p>
        </div>
        <div className="news-source-badges">
          <ProtocolBadge protocol="Aave" />
          <span>+</span>
          <ProtocolBadge protocol="Morpho" />
        </div>
      </div>
      <div className="filter-bar news-filters">
        <div className="filter-left">
          <div className="segmented">
            <button className={protocol === 'all' ? 'active' : ''} onClick={() => setProtocol('all')}>
              All updates
            </button>
            <button className={protocol === 'Aave' ? 'active' : ''} onClick={() => setProtocol('Aave')}>
              Aave
            </button>
            <button className={protocol === 'Morpho' ? 'active' : ''} onClick={() => setProtocol('Morpho')}>
              Morpho
            </button>
          </div>
          <div className="select-wrap">
            <select
              aria-label="Filter news topic"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">All topics</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <ChevronDown size={14} />
          </div>
          <div className="select-wrap">
            <select aria-label="Filter news date" value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="all">All dates</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
            <ChevronDown size={14} />
          </div>
        </div>
        <label className="search-box">
          <Search size={16} />
          <input
            aria-label="Search governance news"
            placeholder="Search the conversation"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {error && <ErrorNotice error={error} retry={() => void load()} />}
      {loading && !data && (
        <div className="panel">
          <Loading text="Reading public governance feeds…" />
        </div>
      )}
      {data && (
        <>
          <div className="news-count">
            <span>{items.length} updates</span>
            <span>
              Updated {date(data.fetchedAt)} ·{' '}
              <button className="text-button" onClick={() => void load(true)} disabled={loading}>
                {loading ? 'Refreshing…' : 'Refresh feeds'}
                <RefreshCw size={12} />
              </button>
            </span>
          </div>
          {data.sources
            .filter((s) => !['live', 'ok', 'success'].includes(s.status))
            .map((s) => (
              <div className="notice" key={s.protocol}>
                <CircleHelp size={15} />
                <span>
                  {s.protocol} source: {s.status}
                  {s.error ? ` · ${s.error}` : ''}
                </span>
                <a href={s.url} target="_blank" rel="noreferrer">
                  Open source <ExternalLink size={12} />
                </a>
              </div>
            ))}
          <div className="news-grid">
            {items.map((item, index) => (
              <a
                className={`news-card ${item.protocol.toLowerCase()}`}
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noreferrer"
              >
                <div className="news-card-top">
                  <ProtocolBadge small protocol={item.protocol} />
                  <span>{date(item.publishedAt, true)}</span>
                </div>
                <span className="news-category">{item.category}</span>
                <h3>{item.title}</h3>
                <p>
                  {item.excerpt ||
                    'Read the full discussion and latest responses on the official governance forum.'}
                </p>
                <div className="news-card-footer">
                  <span>
                    {item.source}
                    {item.replies != null ? ` · ${item.replies} replies` : ''}
                  </span>
                  <span className="news-arrow">
                    <ArrowUpRight size={17} />
                  </span>
                </div>
              </a>
            ))}
          </div>
          {!items.length && (
            <section className="panel">
              <Empty
                title="No updates match these filters"
                detail="Try another topic, date range, or search term."
              />
            </section>
          )}
          <div className="notice">
            <Newspaper size={16} />
            <span>
              Governance discussions describe proposals and opinions. Open the source to check whether a
              change has been approved or executed.
            </span>
          </div>
        </>
      )}
    </>
  );
}
