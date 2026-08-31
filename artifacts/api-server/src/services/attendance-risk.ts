import { db } from "@workspace/db";
import { attendanceRecordsTable } from "@workspace/db";
import { and, gte, lte } from "drizzle-orm";

/**
 * A client needs a check-in when their latest synced 7-day attendance is more
 * than 50% below their rolling 4-week weekly average.
 *
 * Keep this threshold in one place so the list endpoint and dashboard stats
 * cannot disagree about who is at risk.
 */
export const ATTENDANCE_DROP_THRESHOLD = 0.5;
export const MIN_WEEKLY_ATTENDANCE_BASELINE = 1;
const RECENT_ATTENDANCE_DAYS = 7;

export type AttendanceRisk = {
  currentWeeklyAttendance: number;
  attendanceDropPct: number | null;
  needsCheckIn: boolean;
};

function toDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

export async function getAttendanceRiskByClientId(
  clients: Array<{
    id: number;
    isMember: boolean;
    weeklyAttendanceAvg: number | null;
    lastSyncedAt: string | null;
  }>,
  now = new Date(),
): Promise<Map<number, AttendanceRisk>> {
  const today = toDateString(now);
  const attendanceWindows = new Map<number, { start: string; end: string }>();

  for (const client of clients) {
    const syncedDate = client.lastSyncedAt?.split("T")[0];
    const end = syncedDate && syncedDate <= today ? syncedDate : today;
    const startDate = new Date(`${end}T00:00:00.000Z`);
    startDate.setUTCDate(startDate.getUTCDate() - (RECENT_ATTENDANCE_DAYS - 1));
    attendanceWindows.set(client.id, { start: toDateString(startDate), end });
  }

  const starts = [...attendanceWindows.values()].map((window) => window.start);
  const ends = [...attendanceWindows.values()].map((window) => window.end);
  const earliestStart = starts.sort()[0] ?? today;
  ends.sort();
  const latestEnd = ends[ends.length - 1] ?? today;

  const recentAttendance = await db
    .select({
      clientId: attendanceRecordsTable.clientId,
      date: attendanceRecordsTable.date,
    })
    .from(attendanceRecordsTable)
    .where(
      and(
        gte(attendanceRecordsTable.date, earliestStart),
        lte(attendanceRecordsTable.date, latestEnd),
      ),
    );

  const recentCounts = new Map<number, number>();
  for (const record of recentAttendance) {
    const window = attendanceWindows.get(record.clientId);
    if (window && record.date >= window.start && record.date <= window.end) {
      recentCounts.set(record.clientId, (recentCounts.get(record.clientId) ?? 0) + 1);
    }
  }

  return new Map(
    clients.map((client) => {
      const currentWeeklyAttendance = recentCounts.get(client.id) ?? 0;
      const baseline = client.weeklyAttendanceAvg;
      const attendanceDropPct =
        baseline != null && baseline > 0
          ? Math.max(0, Math.round(((baseline - currentWeeklyAttendance) / baseline) * 100))
          : null;

      return [
        client.id,
        {
          currentWeeklyAttendance,
          attendanceDropPct,
          needsCheckIn:
            client.isMember &&
            baseline != null &&
            baseline >= MIN_WEEKLY_ATTENDANCE_BASELINE &&
            currentWeeklyAttendance < baseline * (1 - ATTENDANCE_DROP_THRESHOLD),
        },
      ];
    }),
  );
}