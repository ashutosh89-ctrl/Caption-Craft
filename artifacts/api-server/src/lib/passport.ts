import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export const AUTH_ENABLED = !!(
  process.env["GOOGLE_CLIENT_ID"] && process.env["GOOGLE_CLIENT_SECRET"]
);

if (AUTH_ENABLED) {
  // Construct callback URL from Replit domain or localhost
  const callbackURL = process.env["REPLIT_DOMAINS"]
    ? `https://${process.env["REPLIT_DOMAINS"].split(",")[0]}/api/auth/google/callback`
    : "http://localhost/api/auth/google/callback";

  logger.info({ callbackURL }, "Google OAuth configured");

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env["GOOGLE_CLIENT_ID"]!,
        clientSecret: process.env["GOOGLE_CLIENT_SECRET"]!,
        callbackURL,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) return done(new Error("No email from Google profile"), undefined);

          const existing = await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.googleId, profile.id))
            .limit(1);

          if (existing[0]) {
            // Reset usage counter if 30 days have passed
            const needsReset =
              Date.now() - existing[0].usageResetAt.getTime() > 30 * 24 * 60 * 60 * 1000;
            const [updated] = await db
              .update(usersTable)
              .set({
                name: profile.displayName,
                image: profile.photos?.[0]?.value ?? null,
                ...(needsReset ? { usageCounter: 0, usageResetAt: new Date() } : {}),
              })
              .where(eq(usersTable.id, existing[0].id))
              .returning();
            return done(null, updated);
          }

          const [newUser] = await db
            .insert(usersTable)
            .values({
              email,
              name: profile.displayName,
              image: profile.photos?.[0]?.value ?? null,
              googleId: profile.id,
              status: "FREE",
              usageCounter: 0,
              usageResetAt: new Date(),
            })
            .returning();

          logger.info({ email }, "New user created via Google OAuth");
          return done(null, newUser);
        } catch (err) {
          logger.error({ err }, "Google OAuth callback error");
          return done(err as Error, undefined);
        }
      }
    )
  );
} else {
  logger.warn("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — auth disabled (dev mode)");
}

passport.serializeUser((user: Express.User, done) => {
  done(null, (user as { id: number }).id);
});

passport.deserializeUser(async (id: number, done) => {
  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);
    done(null, user ?? null);
  } catch (err) {
    done(err as Error, null);
  }
});

export default passport;
