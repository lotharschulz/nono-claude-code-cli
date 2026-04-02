import { Router } from "express";
import { authenticateToken, AuthRequest } from "./middleware/auth";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

router.get("/protected", authenticateToken, (req: AuthRequest, res) => {
  res.json({ message: "Access granted", user: req.user });
});

export default router;
