import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const checkinDraftsTable = pgTable("checkin_drafts", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  draftText: text("draft_text").notNull(),
  status: text("status").notNull().default("draft"), // draft | sent | dismissed
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCheckinDraftSchema = createInsertSchema(checkinDraftsTable).omit({ id: true, createdAt: true });
export type InsertCheckinDraft = z.infer<typeof insertCheckinDraftSchema>;
export type CheckinDraft = typeof checkinDraftsTable.$inferSelect;
