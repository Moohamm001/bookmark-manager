import { useCallback, useEffect, useState, type DependencyList } from 'react';

/** Load-on-mount with a reload handle. `data` is null until the first load resolves. */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(async () => {
    try {
      setError(null);
      setData(await fn());
    } catch (e) {
      setError(e);
    }
  }, deps);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, setError, reload };
}
