import type { Request, Response, NextFunction } from "express";

export interface AuthenticatedUser {
  id: string;
  email?: string;
  role?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const userId = req.header("x-dev-user-id");
  if (userId) req.user = { id: userId };
  next();
}
