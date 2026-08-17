import { useEffect } from "react";
import { useLocation } from "react-router-dom";


/** Scroll a same-page feature target into view whenever its URL hash changes. */
export function useFeatureAnchor(refreshKey?: unknown) {
  const { hash } = useLocation();

  useEffect(() => {
    const anchor = decodeURIComponent(hash.replace(/^#/, ""));
    if (!anchor) return;

    const target = document.getElementById(`section-${anchor}`)
      ?? document.getElementById(anchor);
    target?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [hash, refreshKey]);
}
