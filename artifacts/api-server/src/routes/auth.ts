import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import passportInstance, { AUTH_ENABLED } from "../lib/passport";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ─── Config ───────────────────────────────────────────────────────────────────
router.get("/auth/config", (_req, res) => {
  res.json({ authEnabled: AUTH_ENABLED });
});

// ─── Current user ─────────────────────────────────────────────────────────────
router.get("/auth/me", (req: Request, res: Response): void => {
  if (!AUTH_ENABLED) {
    // Dev mode: bypass auth entirely — return a permissive mock user
    res.json({
      authenticated: true,
      authEnabled: false,
      user: {
        id: -1,
        name: "Creator",
        email: "dev@local",
        image: null,
        status: "FREE",
        usageCounter: 0,
        usageResetAt: new Date().toISOString(),
      },
    });
    return;
  }

  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ authenticated: false, authEnabled: true });
    return;
  }

  const u = req.user as {
    id: number; email: string; name: string; image: string | null;
    status: string; usageCounter: number; usageResetAt: Date;
  };

  res.json({
    authenticated: true,
    authEnabled: true,
    user: {
      id: u.id,
      email: u.email,
      name: u.name,
      image: u.image,
      status: u.status,
      usageCounter: u.usageCounter,
      usageResetAt: u.usageResetAt,
    },
  });
});

// ─── Google OAuth ─────────────────────────────────────────────────────────────
router.get("/auth/google", (req: Request, res: Response, next: NextFunction): void => {
  if (!AUTH_ENABLED) {
    res.status(503).json({
      error: "Google authentication is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    });
    return;
  }
  passportInstance.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});

router.get(
  "/auth/google/callback",
  (req: Request, res: Response, next: NextFunction) => {
    passportInstance.authenticate("google", {
      failureRedirect: "/?auth=failed",
    })(req, res, next);
  },
  (req: Request, res: Response): void => {
    logger.info({ user: (req.user as any)?.email }, "Google OAuth login success");
    res.redirect("/");
  }
);

// ─── Logout ───────────────────────────────────────────────────────────────────
router.post("/auth/logout", (req: Request, res: Response): void => {
  req.logout(() => {
    res.json({ success: true });
  });
});

export default router;
