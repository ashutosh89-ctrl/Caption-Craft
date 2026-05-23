import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { supabase } from "@workspace/db";
import { logger } from "./logger";

export const AUTH_ENABLED = !!(
  process.env["GOOGLE_CLIENT_ID"] && process.env["GOOGLE_CLIENT_SECRET"]
);

if (AUTH_ENABLED) {
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

          const { data: existing } = await supabase
            .from("users")
            .select("*")
            .eq("google_id", profile.id)
            .maybeSingle();

          if (existing) {
            const needsReset =
              Date.now() - new Date(existing.usage_reset_at).getTime() > 30 * 24 * 60 * 60 * 1000;
            const updateData: Record<string, unknown> = {
              name: profile.displayName,
              image: profile.photos?.[0]?.value ?? null,
            };
            if (needsReset) {
              updateData.usage_counter = 0;
              updateData.usage_reset_at = new Date().toISOString();
            }
            const { data: updated } = await supabase
              .from("users")
              .update(updateData)
              .eq("id", existing.id)
              .select()
              .single();
            return done(null, updated ?? existing);
          }

          const { data: newUser, error } = await supabase
            .from("users")
            .insert({
              email,
              name: profile.displayName,
              image: profile.photos?.[0]?.value ?? null,
              google_id: profile.id,
              status: "FREE",
              usage_counter: 0,
              usage_reset_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (error) {
            logger.error({ error }, "Failed to create user via Google OAuth");
            return done(new Error("Failed to create user"), undefined);
          }

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
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    done(null, user ?? null);
  } catch (err) {
    done(err as Error, null);
  }
});

export default passport;
