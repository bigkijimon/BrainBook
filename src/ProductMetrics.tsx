import { useEffect, useState } from 'react';
import { Wallet, Users, Activity, CreditCard, AlertCircle, RefreshCw } from 'lucide-react';
import { NeonAccent } from './NeonAccent';

export interface ProductMetricsData {
  totalUsers: number;
  totalDiagnoses: number;
  activeSubscriptions: number;
  totalRevenueJpy: number;
  currency: string;
  asOf: string;
}

export interface ProductMetricsProps {
  productName: string;
  apiUrl: string;
  refreshIntervalMs?: number;
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat('ja-JP').format(num);
}

function formatCurrency(jpy: number): string {
  return `¥${formatNumber(jpy)}`;
}

function formatDateTime(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function ProductMetrics({ productName, apiUrl, refreshIntervalMs = 30000 }: ProductMetricsProps) {
  const [data, setData] = useState<ProductMetricsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchMetrics = async () => {
    try {
      const response = await fetch(apiUrl, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const json = await response.json();
      setData(json);
      setError(null);
      setLastFetch(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : '取得できません');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, refreshIntervalMs);
    return () => clearInterval(interval);
  }, [apiUrl, refreshIntervalMs]);

  const metricCards = [
    { key: 'totalUsers', label: '利用者数', value: data?.totalUsers ?? 0, icon: Users, colorClass: 'pm-color-indigo', bgClass: 'pm-bg-indigo' },
    { key: 'totalDiagnoses', label: '診断実行数', value: data?.totalDiagnoses ?? 0, icon: Activity, colorClass: 'pm-color-emerald', bgClass: 'pm-bg-emerald' },
    { key: 'activeSubscriptions', label: '有料会員数', value: data?.activeSubscriptions ?? 0, icon: CreditCard, colorClass: 'pm-color-amber', bgClass: 'pm-bg-amber' },
    { key: 'totalRevenueJpy', label: '累計収益', value: formatCurrency(data?.totalRevenueJpy ?? 0), icon: Wallet, colorClass: 'pm-color-rose', bgClass: 'pm-bg-rose', isCurrency: true },
  ];

  return (
    <section className="product-metrics card-shell" aria-labelledby="product-metrics-heading">
      <NeonAccent/>
      <div className="product-metrics-head">
        <h3 id="product-metrics-heading" className="product-metrics-title">
          <span className="product-metrics-icon" aria-hidden="true">
            <Wallet size={20} className="pm-color-rose" />
          </span>
          {productName}・利用状況・収益ダッシュボード
        </h3>
        <div className="product-metrics-meta">
          {lastFetch && (
            <span className="product-metrics-updated" title={`最終取得: ${formatDateTime(lastFetch.toISOString())}`}>
              更新: {lastFetch.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          {loading && !data && (
            <span className="product-metrics-loading" aria-live="polite">
              <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
              読み込み中…
            </span>
          )}
          {!loading && error && (
            <span className="product-metrics-error" aria-live="assertive">
              <AlertCircle size={14} aria-hidden="true" />
              {error}
            </span>
          )}
          <button
            type="button"
            className="product-metrics-refresh ghost-button"
            onClick={fetchMetrics}
            disabled={loading}
            aria-label="メトリクスを手動更新"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="product-metrics-grid" role="list" aria-label={`${productName}の主要指標`}>
        {metricCards.map((metric) => (
          <article
            key={metric.key}
            className={`product-metric-card ${metric.bgClass}`}
            role="listitem"
            aria-label={`${metric.label}: ${metric.isCurrency ? metric.value : formatNumber(metric.value as number)}`}
          >
            <div className="product-metric-icon" aria-hidden="true">
              <metric.icon size={24} className={metric.colorClass} />
            </div>
            <div className="product-metric-content">
              <p className="product-metric-label">{metric.label}</p>
              <p className="product-metric-value">
                {metric.isCurrency ? metric.value : formatNumber(metric.value as number)}
              </p>
            </div>
          </article>
        ))}
      </div>

      {data && (
        <details className="product-metrics-details">
          <summary>詳細情報</summary>
          <dl className="product-metrics-dl">
            <div>
              <dt>通貨</dt>
              <dd>{data.currency}</dd>
            </div>
            <div>
              <dt>データ取得時刻</dt>
              <dd>{formatDateTime(data.asOf)}</dd>
            </div>
            <div>
              <dt>データソース</dt>
              <dd>
                利用者数・診断数: SQLite(users, diagnoses) / 有料会員数・収益: Stripe API(サブスクリプション・請求書集計)
              </dd>
            </div>
          </dl>
        </details>
      )}
    </section>
  );
}

export default ProductMetrics;