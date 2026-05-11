import { useState, useEffect } from 'react';
import analyticsService from '../services/analytics.service';
import type { AnalyticsSummary, TrendsResponse } from '../types';

export function useAnalytics() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [trends, setTrends] = useState<TrendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [summaryData, trendsData] = await Promise.all([
        analyticsService.getSummary(),
        analyticsService.getTrends()
      ]);
      setSummary(summaryData);
      setTrends(trendsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    try {
      await analyticsService.refresh();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh analytics');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return {
    summary,
    trends,
    loading,
    error,
    refresh,
    reload: loadData
  };
}
