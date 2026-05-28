import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useAppStore } from "../store/useAppStore";
import type { PanelAnchor, PanelId } from "../types/app";
import { damp, smoothWander } from "../engine/motionPhysics";
import { useReducedMotion } from "./useReducedMotion";

interface LivingMotionOptions {
  id: PanelId;
  anchor: PanelAnchor;
  width: number;
  height: number;
  priority: number;
  dimmed: boolean;
  expanded: boolean;
}

export function useLivingPanelMotion(options: LivingMotionOptions) {
  const { id, anchor, width, height, priority, dimmed, expanded } = options;
  const mode = useAppStore((s) => s.mode);
  const focusPanelId = useAppStore((s) => s.focusPanelId);
  const reducedMotion = useReducedMotion();

  const seed = useMemo(() => id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0), [id]);
  const stateRef = useRef({ initialized: false, x: 0, y: 0, scale: anchor.scale, rotate: anchor.rotateDeg, opacity: 1 });
  const [style, setStyle] = useState<CSSProperties>(() => ({ width, height, opacity: 0 }));

  useEffect(() => {
    let frame = 0;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      frame += 1;
      const t = now / 1000;
      const baseX = (anchor.xPct / 100) * window.innerWidth - width / 2;
      const baseY = (anchor.yPct / 100) * window.innerHeight - height / 2;
      const focused = focusPanelId === id;
      const someFocus = Boolean(focusPanelId);

      let driftAmp = 8 + priority * 0.8;
      if (mode === "listening") driftAmp *= 0.75;
      if (mode === "thinking") driftAmp *= 0.55;
      if (mode === "generating") driftAmp *= 1.25;
      if (mode === "analyzing") driftAmp *= 0.7;
      if (mode === "alert") driftAmp *= 0.45;
      if (mode === "reviewing") driftAmp *= 0.25;
      if (someFocus && !focused) driftAmp *= 0.25;
      if (focused) driftAmp *= 0.15;
      if (expanded) driftAmp *= 0.05;
      if (reducedMotion) driftAmp = 0;

      const wander = smoothWander(seed, t);
      const targetX = baseX + wander.x * driftAmp;
      const targetY = baseY + wander.y * driftAmp;
      const targetScale = expanded ? Math.min(1.24, 1.08 + priority * 0.012) : focused ? 1.04 : dimmed ? 0.96 : anchor.scale;
      const targetOpacity = dimmed ? 0.34 : 1;
      const targetRotate = focused || expanded ? 0 : anchor.rotateDeg + wander.x * 0.5;
      const s = stateRef.current;

      if (!s.initialized) {
        s.x = targetX;
        s.y = targetY;
        s.scale = targetScale;
        s.rotate = targetRotate;
        s.opacity = targetOpacity;
        s.initialized = true;
      }

      s.x = damp(s.x, targetX, 5.5, dt);
      s.y = damp(s.y, targetY, 5.5, dt);
      s.scale = damp(s.scale, targetScale, 7, dt);
      s.rotate = damp(s.rotate, targetRotate, 4, dt);
      s.opacity = damp(s.opacity, targetOpacity, 8, dt);

      if (frame % 2 === 0) {
        setStyle({
          width,
          height,
          opacity: s.opacity,
          transform: `translate3d(${s.x}px, ${s.y}px, 0) scale(${s.scale}) rotate(${s.rotate}deg)`,
          zIndex: focused || expanded ? 24 : 8 + Math.round(anchor.depth * 10),
          filter: dimmed ? "blur(1px) saturate(0.65)" : "none",
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [id, anchor.xPct, anchor.yPct, anchor.depth, anchor.rotateDeg, anchor.scale, width, height, priority, dimmed, expanded, mode, focusPanelId, seed, reducedMotion]);

  return style;
}
