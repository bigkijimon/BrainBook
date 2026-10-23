import { useEffect, useState } from 'react';
import { Wallet, Users, Activity, CreditCard, AlertCircle, RefreshCw } from 'lucide-react';

export interface ProductsOverviewItem {
  productName: string;
  apiUrl: string;
  iconUrl?: string;
}

interface ProductMetricsData {
  totalUsers: number;
  totalDiagnoses: number;
  activeSubscriptions: number;
  totalRevenueJpy: number;
  currency: string;
  asOf: string;
}

interface RowState {
  data: ProductMetricsData | null;
  error: string | null;
  loading: boolean;
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat('ja-JP').format(num);
}

function formatCurrency(jpy: number): string {
  return `¥${formatNumber(jpy)}`;
}

export interface ProductsOverviewProps {
  products: ProductsOverviewItem[];
  refreshIntervalMs?: number;
}

export function ProductsOverview({ products, refreshIntervalMs = 30000 }: ProductsOverviewProps) {
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchAll = async () => {
    const results = await Promise.all(products.map(async (p) => {
      try {
        const response = await fetch(p.apiUrl, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json();
        return [p.apiUrl, { data: json, error: null, loading: false }] as const;
      } catch (err) {
        return [p.apiUrl, { data: null, error: err instanceof Error ? err.message : '取得できません', loading: false }] as const;
      }
    }));
    setRows(Object.fromEntries(results));
    setLastFetch(new Date());
  };

  useEffect(() => {
    void fetchAll();
    const interval = setInterval(fetchAll, refreshIntervalMs);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.map((p) => p.apiUrl).join(','), refreshIntervalMs]);

  const anyLoading = products.some((p) => !rows[p.apiUrl]);

  return (
    <section className="products-overview card-shell" aria-labelledby="products-overview-heading">
      <div className="products-overview-head">
        <h3 id="products-overview-heading" className="products-overview-title">
          <span className="products-overview-icon" aria-hidden="true">
            <Wallet size={18} className="pm-color-rose" />
          </span>
          プロダクト・利用状況・収益ダッシュボード
        </h3>
        <div className="products-overview-meta">
          {lastFetch && (
            <span className="products-overview-updated">
              更新: {lastFetch.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          {anyLoading && (
            <span className="product-metrics-loading" aria-live="polite">
              <RefreshCw size={13} className="animate-spin" aria-hidden="true" />
            </span>
          )}
          <button
            type="button"
            className="product-metrics-refresh ghost-button"
            onClick={() => void fetchAll()}
            aria-label="すべてのプロダクトの指標を手動更新"
          >
            <RefreshCw size={13} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="products-overview-list" role="list">
        {products.map((p) => {
          const row = rows[p.apiUrl];
          const d = row?.data;
          return (
            <div key={p.apiUrl} className="products-overview-row" role="listitem">
              <span className="products-overview-name">
                {p.iconUrl && <img className="products-overview-product-icon" src={p.iconUrl} alt="" aria-hidden="true" loading="lazy" />}
                {p.productName}
              </span>
              {row?.error ? (
                <span className="product-metrics-error">
                  <AlertCircle size={13} aria-hidden="true" />
                  {row.error}
                </span>
              ) : (
                <div className="products-overview-stats">
                  <span className="products-overview-stat">
                    <Users size={13} className="pm-color-indigo" aria-hidden="true" />
                    {formatNumber(d?.totalUsers ?? 0)}
                  </span>
                  <span className="products-overview-stat">
                    <Activity size={13} className="pm-color-emerald" aria-hidden="true" />
                    {formatNumber(d?.totalDiagnoses ?? 0)}
                  </span>
                  <span className="products-overview-stat">
                    <CreditCard size={13} className="pm-color-amber" aria-hidden="true" />
                    {formatNumber(d?.activeSubscriptions ?? 0)}
                  </span>
                  <span className="products-overview-stat">
                    <Wallet size={13} className="pm-color-rose" aria-hidden="true" />
                    {formatCurrency(d?.totalRevenueJpy ?? 0)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="products-overview-legend">
        <Users size={11} aria-hidden="true" /> 利用者数　
        <Activity size={11} aria-hidden="true" /> 実行数　
        <CreditCard size={11} aria-hidden="true" /> 有料会員数　
        <Wallet size={11} aria-hidden="true" /> 累計収益
      </p>
    </section>
  );
}

export default ProductsOverview;
