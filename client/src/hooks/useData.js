import { useCallback, useEffect, useRef, useState } from 'react';

export function useData(loader, reloadKey = '') {
  const [data, setData] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const loaderRef = useRef(loader); loaderRef.current = loader;
  const hasDataRef = useRef(false);
  const stableReloadKey = typeof reloadKey === 'string' ? reloadKey : JSON.stringify(reloadKey);
  const load = useCallback(async () => { if (!hasDataRef.current) setLoading(true); setError(''); try { const next = await loaderRef.current(); hasDataRef.current = true; setData(next); return next; } catch (err) { setError(err.message); return null; } finally { setLoading(false); } }, []);
  useEffect(() => { load(); window.addEventListener('orbit:refresh', load); return () => window.removeEventListener('orbit:refresh', load); }, [load, stableReloadKey]);
  return { data, setData, loading, error, reload: load };
}
