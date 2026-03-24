import { useCallback, useEffect, useState } from "react";

import {
  fetchLineaAccessSnapshot,
  getEmptyLineaAccessSnapshot,
  type LineaManagedAccessSnapshot,
} from "@/lib/linea-access";

export function useLineaAccessSnapshot() {
  const [snapshot, setSnapshot] = useState<LineaManagedAccessSnapshot>(getEmptyLineaAccessSnapshot());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setError("");
    setLoading(true);

    try {
      const nextSnapshot = await fetchLineaAccessSnapshot({ signal });
      setSnapshot(nextSnapshot);
    } catch (caughtError) {
      if (signal?.aborted) {
        return;
      }

      setError(caughtError instanceof Error ? caughtError.message : "Could not load managed access.");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const abortController = new AbortController();
    void refresh(abortController.signal);

    return () => {
      abortController.abort();
    };
  }, [refresh]);

  return {
    snapshot,
    loading,
    error,
    refresh: () => refresh(),
  };
}
