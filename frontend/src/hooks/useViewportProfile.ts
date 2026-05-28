import { useWindowSize } from "./useWindowSize";

export type ViewportProfile = "compact" | "standard" | "wide";

export function useViewportProfile(): ViewportProfile {
  const { width } = useWindowSize();
  if (width < 980) return "compact";
  if (width > 1920) return "wide";
  return "standard";
}
