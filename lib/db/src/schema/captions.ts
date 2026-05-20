import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const savedCaptionsTable = pgTable("saved_captions", {
  id: serial("id").primaryKey(),
  text: text("text").notNull(),
  hashtags: text("hashtags").array().notNull().default([]),
  cta: text("cta").notNull(),
  platform: text("platform").notNull(),
  tone: text("tone").notNull(),
  imagePreviewBase64: text("image_preview_base64"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSavedCaptionSchema = createInsertSchema(savedCaptionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSavedCaption = z.infer<typeof insertSavedCaptionSchema>;
export type SavedCaption = typeof savedCaptionsTable.$inferSelect;
