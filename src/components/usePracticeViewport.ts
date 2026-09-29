"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

const compactQuery = "(max-width: 700px), (any-pointer: coarse)";

function subscribeCompact(onChange: () => void) {
  const media = window.matchMedia(compactQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getCompact() {
  return window.matchMedia(compactQuery).matches;
}

export function usePracticeViewport(active: boolean) {
  const compact = useSyncExternalStore(subscribeCompact, getCompact, () => false);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = viewportRef.current;
    if (!active || !compact || !element) return;
    const style = element.style;
    const viewport = window.visualViewport;
    let frame = 0;
    function update() {
      frame = 0;
      // Keep the document scrollable and zoomable; only measure its visible area.
      style.setProperty("--practice-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
      style.setProperty("--practice-viewport-top", `${Math.max(0, viewport?.offsetTop ?? 0)}px`);
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    update();
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      element.style.removeProperty("--practice-viewport-height");
      element.style.removeProperty("--practice-viewport-top");
    };
  }, [active, compact]);

  return { compact, viewportRef };
}
