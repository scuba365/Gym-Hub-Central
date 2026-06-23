import { pgTable, serial, integer, text, doublePrecision, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const inbodyScansTable = pgTable("inbody_scans", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  scannedAt: text("scanned_at").notNull(),
  weightKg: doublePrecision("weight_kg"),
  bodyFatPct: doublePrecision("body_fat_pct"),
  muscleMassKg: doublePrecision("muscle_mass_kg"),
  bmr: doublePrecision("bmr"),
  visceralFatLevel: doublePrecision("visceral_fat_level"),
  bmi: doublePrecision("bmi"),
  totalBodyWaterKg: doublePrecision("total_body_water_kg"),
  rawJson: jsonb("raw_json"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInbodyScanSchema = createInsertSchema(inbodyScansTable).omit({ id: true, createdAt: true });
export type InsertInbodyScan = z.infer<typeof insertInbodyScanSchema>;
export type InbodyScan = typeof inbodyScansTable.$inferSelect;
