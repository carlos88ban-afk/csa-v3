"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";

// Cache en memoria (stale-while-revalidate): al volver a un modulo se pinta
// al instante lo ya conocido y se refresca en segundo plano. Se vacia cuando
// cambia el usuario para no cruzar datos entre sesiones.
const cache = new Map<string, unknown>();

export function clearApiCache() {
  cache.clear();
}

export function useCachedGet<T>(path: string | null) {
  const [data, setData] = useState<T | undefined>(() => (path ? (cache.get(path) as T | undefined) : undefined));
  const reload = useCallback(async () => {
    if (!path) return;
    const fresh = await api.get<T>(path);
    cache.set(path, fresh);
    setData(fresh);
  }, [path]);
  useEffect(() => {
    if (!path) return;
    setData(cache.get(path) as T | undefined);
    void reload().catch(() => {});
  }, [path, reload]);
  return { data, reload };
}
