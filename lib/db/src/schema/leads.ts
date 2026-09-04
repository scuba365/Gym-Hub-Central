import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const LEAD_STATUSES = [
  "new",
  "qualified",
  "challenge_started",
  "converted",
  "dropped_off",
] as const;

export const LEAD_SOURCES = [
  "manual",
  "goteamup",
  "instagram",
  "facebook",
  "referral",
  "other",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  source: text("source").notNull().default("manual"),
  status: text("status").notNull().default("new"),
  notes: text("notes"),
  goalText: text("goal_text"),
  followUpAt: text("follow_up_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Lead = typeof leadsTable.$inferSelect;
export type InsertLead = typeof leadsTable.$inferInsert;
