import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const attendanceRecordsTable = pgTable("attendance_records", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  className: text("class_name"),
  externalId: text("external_id").unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAttendanceSchema = createInsertSchema(attendanceRecordsTable).omit({ id: true, createdAt: true });
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type AttendanceRecord = typeof attendanceRecordsTable.$inferSelect;
