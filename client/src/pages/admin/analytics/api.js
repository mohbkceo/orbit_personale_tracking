import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../api/client.js';

const base = '/admin/analytics';
const listReports = new Set(['visitors', 'sessions', 'events', 'eventSummary']);
const get = (path, params, signal) => api.get(`${base}${path}`, { params, signal });
export const analyticsApi = {
  overview: (params, signal) => get('/overview', params, signal),
  trend: (params, signal) => get('/trend', params, signal),
  performance: (params, signal) => get('/performance', params, signal),
  sourceQuality: (params, signal) => get('/source-quality', params, signal),
  funnel: (params, signal) => get('/funnel', params, signal),
  conversions: (params, signal) => get('/conversions', params, signal),
  journey: (eventId, signal) =>
    get(`/conversions/${encodeURIComponent(eventId)}/journey`, {}, signal),
  visitors: (params, signal) => get('/visitors', params, signal),
  visitorJourney: (visitorId, signal) =>
    get(`/visitors/${encodeURIComponent(visitorId)}/journey`, {}, signal),
  sessions: (params, signal) => get('/sessions', params, signal),
  events: (params, signal) => get('/events', params, signal),
  eventTrend: (params, signal) => get('/event-trend', params, signal),
  eventSummary: (params, signal) => get('/event-summary', params, signal),
  product: (params, signal) => get('/product', params, signal),
  retention: (params, signal) => get('/retention', params, signal),
};

export function useAnalyticsData(method, params, revision = 0) {
  const key = JSON.stringify(params);
  const stableParams = useMemo(() => (key === 'null' ? null : JSON.parse(key)), [key]);
  const [result, setResult] = useState({
    data: null,
    pagination: null,
    loading: true,
    error: null,
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    if (!stableParams) {
      setResult({ data: null, pagination: null, loading: false, error: null });
      return () => controller.abort();
    }
    setResult((previous) => ({ ...previous, loading: true, error: null }));
    analyticsApi[method](stableParams, controller.signal)
      .then((response) => {
        if (
          response?.data == null ||
          (listReports.has(method)
            ? !Array.isArray(response.data)
            : typeof response.data !== 'object' || Array.isArray(response.data))
        )
          throw new Error('Malformed analytics response');
        if (!controller.signal.aborted)
          setResult({
            data: response.data,
            pagination: response.pagination || response.data?.pagination || null,
            loading: false,
            error: null,
          });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({
            data: null,
            pagination: null,
            loading: false,
            error: error.message || 'Analytics request failed',
          });
      });
    return () => controller.abort();
  }, [method, stableParams, revision, attempt]);
  return { ...result, retry: () => setAttempt((value) => value + 1) };
}
