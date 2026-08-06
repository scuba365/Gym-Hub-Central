import { pgTable, serial, text, boolean, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  photoUrl: text("photo_url"),
  goals: text("goals"),
  needsMealPlan: boolean("needs_meal_plan").notNull().default(false),
  notes: text("notes"),
  engagementStatus: text("engagement_status").notNull().default("unknown"),
  weeklyAttendanceAvg: doublePrecision("weekly_attendance_avg"),
  lastAttendanceDate: text("last_attendance_date"),
  lastTrainingDate: text("last_training_date"),
  workoutCompliancePct: doublePrecision("workout_compliance_pct"),
  latestScanDate: text("latest_scan_date"),
  latestWeight: doublePrecision("latest_weight"),
  latestBodyFatPct: doublePrecision("latest_body_fat_pct"),
  latestMuscleMass: doublePrecision("latest_muscle_mass"),
  lastSyncedAt: text("last_synced_at"),
  dailyCalorieTarget: doublePrecision("daily_calorie_target"),
  proteinTargetG: doublePrecision("protein_target_g"),
  carbsTargetG: doublePrecision("carbs_target_g"),
  fatTargetG: doublePrecision("fat_target_g"),
  macroTargetsUpdatedAt: text("macro_targets_updated_at"),
  macroTargetsRationale: text("macro_targets_rationale"),
  lastAiInsight: text("last_ai_insight"),
  lastAiInsightAt: text("last_ai_insight_at"),
  teamupId: text("teamup_id").unique(),
  trainerizeId: text("trainerize_id").unique(),
  inbodyId: text("inbody_id").unique(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertClientSchema = createInsertSchema(clientsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;
