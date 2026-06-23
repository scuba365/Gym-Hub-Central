import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const trainingSessionsTable = pgTable("training_sessions", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  workoutName: text("workout_name"),
  completed: boolean("completed").notNull().default(false),
  externalId: text("external_id").unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTrainingSessionSchema = createInsertSchema(trainingSessionsTable).omit({ id: true, createdAt: true });
export type InsertTrainingSession = z.infer<typeof insertTrainingSessionSchema>;
export type TrainingSession = typeof trainingSessionsTable.$inferSelect;
