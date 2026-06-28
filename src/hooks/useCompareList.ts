import { useEffect, useState, useCallback } from "react";

const KEY = "gf_compare_ids";
const MAX = 4;

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function write(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX)));
    window.dispatchEvent(new CustomEvent("gf-compare-change"));
  } catch {}
}

export function useCompareList() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    setIds(read());
    const onChange = () => setIds(read());
    window.addEventListener("gf-compare-change", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("gf-compare-change", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const toggle = useCallback((id: string) => {
    const curr = read();
    const next = curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id].slice(0, MAX);
    write(next);
  }, []);

  const remove = useCallback((id: string) => write(read().filter((x) => x !== id)), []);
  const clear = useCallback(() => write([]), []);

  return { ids, toggle, remove, clear, max: MAX };
}
