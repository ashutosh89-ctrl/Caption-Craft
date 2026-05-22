import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  image: text("image"),
  googleId: text("google_id").notNull().unique(),
  status: text("status").notNull().default("FREE"),
  usageCounter: integer("usage_counter").notNull().default(0),
  usageResetAt: timestamp("usage_reset_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof usersTable.$inferSelect;
