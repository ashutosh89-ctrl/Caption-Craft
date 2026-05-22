import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPg from "connect-pg-simple";
import router from "./routes";
import { logger } from "./lib/logger";
import passportInstance from "./lib/passport";
import { pool } from "@workspace/db";

const PgStore = connectPg(session);
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
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// ─── Session ──────────────────────────────────────────────────────────────────
app.use(
  session({
    store: new PgStore({
      pool,
      createTableIfMissing: true,
      tableName: "sessions",
    }),
    secret: process.env["SESSION_SECRET"] ?? "captioncraft-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true,
      sameSite: "lax",
      // Replit proxy terminates TLS — Express sees plain HTTP behind it.
      // Setting secure: false lets the cookie be set over the internal HTTP link.
      secure: false,
    },
  })
);

// ─── Passport ─────────────────────────────────────────────────────────────────
app.use(passportInstance.initialize());
app.use(passportInstance.session());

app.use("/api", router);

export default app;
