import { useLayoutEffect, type RefObject } from "react";

export function useAutoResizeTextarea(ref: RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(128, Math.max(44, el.scrollHeight))}px`;
  }, [ref, value]);
}
