import { useCallback, useEffect, useRef, useState } from 'react';

export function useData(loader, reloadKey = '') {
  const [data, setData] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const loaderRef = useRef(loader); loaderRef.current = loader;
  const stableReloadKey = typeof reloadKey === 'string' ? reloadKey : JSON.stringify(reloadKey);
  const load = useCallback(async () => { setLoading(true); setError(''); try { setData(await loaderRef.current()); } catch (err) { setError(err.message); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); window.addEventListener('orbit:refresh', load); return () => window.removeEventListener('orbit:refresh', load); }, [load, stableReloadKey]);
  return { data, setData, loading, error, reload: load };
}
