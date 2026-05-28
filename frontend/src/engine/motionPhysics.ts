export function damp(current: number, target: number, lambda: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

export function smoothWander(seed: number, t: number) {
  return {
    x: Math.sin(t * 0.33 + seed * 0.17) * 0.55 + Math.sin(t * 0.13 + seed) * 0.45,
    y: Math.cos(t * 0.29 + seed * 0.11) * 0.58 + Math.sin(t * 0.19 + seed * 0.73) * 0.42,
  };
}
