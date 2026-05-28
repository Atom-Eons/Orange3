import type { Request, Response, NextFunction } from "express";

const buckets = new Map<string, { count: number; resetAt: number }>();

export function simpleRateLimit(input: { windowMs: number; max: number }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const current = buckets.get(key);
    if (!current || current.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + input.windowMs });
      next();
      return;
    }
    current.count += 1;
    if (current.count > input.max) {
      res.status(429).json({ ok: false, error: "Rate limit exceeded" });
      return;
    }
    next();
  };
}
