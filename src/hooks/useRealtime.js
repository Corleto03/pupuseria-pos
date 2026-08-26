"use client";

import { useEffect } from "react";

export function useRealtime(onEvent) {
  useEffect(() => {
    const es = new EventSource("/api/realtime");
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.hello) return;
        onEvent(data);
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }, [onEvent]);
}
