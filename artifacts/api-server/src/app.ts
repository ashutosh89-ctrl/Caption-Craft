import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import router from "./routes";
import { logger } from "./lib/logger";
import passportInstance from "./lib/passport";

// ─── SESSION_SECRET crash guard ─────────────────────────────────────────────────
if (!process.env["SESSION_SECRET"]) {
  logger.error("FATAL: SESSION_SECRET environment variable is missing. Server cannot start safely.");
  process.exit(1);
}

const app: Express = express();

// Trust Replit's reverse proxy so secure cookies and redirects work correctly
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  })
);

app.use(cors({ credentials: true, origin: true }));

// ─── Segregated payload limits ─────────────────────────────────────────────────
// 150kb for general text routes
app.use(express.json({ limit: "150kb" }));
app.use(express.urlencoded({ extended: true, limit: "150kb" }));

// 4mb override for the captions/stream route (Base64 images)
app.use("/api/captions/stream", express.json({ limit: "4mb" }));

// ─── Session (memory store — no pg dependency) ─────────────────────────────────
app.use(
  session({
    secret: process.env["SESSION_SECRET"]!,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true,
      sameSite: "lax",
      secure: false,
    },
  })
);

// ─── Passport ─────────────────────────────────────────────────────────────────
app.use(passportInstance.initialize());
app.use(passportInstance.session());

app.use("/api", router);

export default app;
