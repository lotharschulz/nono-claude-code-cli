import { Request, Response, NextFunction } from "express";
import * as jwt from "jsonwebtoken";

export const JWT_SECRET = process.env.JWT_SECRET || "test-secret";

export interface AuthRequest extends Request {
  user?: jwt.JwtPayload | string;
}

export function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    res.status(401).json({ error: "Missing token" });
    return;
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(403).json({ error: "Invalid or expired token" });
  }
}
