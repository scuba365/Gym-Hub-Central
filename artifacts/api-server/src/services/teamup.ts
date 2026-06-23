import { db } from "@workspace/db";
import { clientsTable, attendanceRecordsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";

const TEAMUP_BASE_URL = "https://api.teamup.com";

interface TeamupMember {
  id: string;
  name: string;
  email?: string;
  photo_url?: string;
}

interface TeamupEvent {
  id: string;
  title: string;
  start_dt: string;
  signup_count: number;
  signup_list?: Array<{ name: string; email?: string; member_id?: string }>;
}

async function teamupRequest(path: string, apiKey: string): Promise<any> {
  const response = await fetch(`${TEAMUP_BASE_URL}${path}`, {
    headers: {
      "Teamup-Token": apiKey,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`TeamUp API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<any>;
}

export async function syncTeamup(): Promise<{ clientsUpdated: number; attendanceAdded: number }> {
  const apiKey = process.env.TEAMUP_API_KEY;
  const calendarKey = process.env.TEAMUP_CALENDAR_KEY;

  if (!apiKey || !calendarKey) {
    logger.warn("TeamUp credentials not configured (TEAMUP_API_KEY, TEAMUP_CALENDAR_KEY)");
    return { clientsUpdated: 0, attendanceAdded: 0 };
  }

  let clientsUpdated = 0;
  let attendanceAdded = 0;

  try {
    // Fetch events from the past 90 days to calculate attendance
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);

    const eventsData = await teamupRequest(
      `/${calendarKey}/events?startDate=${startDate.toISOString().split("T")[0]}&endDate=${endDate.toISOString().split("T")[0]}`,
      apiKey
    );

    const events: TeamupEvent[] = eventsData.events || [];

    // Process each event's signup list
    for (const event of events) {
      const eventDate = event.start_dt?.split("T")[0] || new Date().toISOString().split("T")[0];
      const signups = event.signup_list || [];

      for (const signup of signups) {
        const memberEmail = signup.email?.toLowerCase();
        const memberName = signup.name;

        if (!memberEmail && !memberName) continue;

        // Find or create client by email or name
        let client = null;
        if (memberEmail) {
          const found = await db
            .select()
            .from(clientsTable)
            .where(eq(clientsTable.email, memberEmail))
            .limit(1);
          client = found[0];
        }

        if (!client && memberName) {
          const found = await db
            .select()
            .from(clientsTable)
            .where(eq(clientsTable.name, memberName))
            .limit(1);
          client = found[0];
        }

        if (!client) {
          // Create new client from TeamUp data
          const [newClient] = await db
            .insert(clientsTable)
            .values({
              name: memberName,
              email: memberEmail || null,
              teamupId: signup.member_id || null,
            })
            .returning();
          client = newClient;
          clientsUpdated++;
        } else if (signup.member_id && !client.teamupId) {
          await db
            .update(clientsTable)
            .set({ teamupId: signup.member_id })
            .where(eq(clientsTable.id, client.id));
        }

        // Record attendance (skip duplicates via external_id)
        const externalId = `teamup-${event.id}-${client.id}`;
        const existing = await db
          .select()
          .from(attendanceRecordsTable)
          .where(eq(attendanceRecordsTable.externalId, externalId))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(attendanceRecordsTable).values({
            clientId: client.id,
            date: eventDate,
            className: event.title || null,
            externalId,
          });
          attendanceAdded++;
        }
      }
    }

    // Recalculate weekly attendance averages for all clients
    await recalculateAttendanceAverages();
  } catch (err) {
    logger.error({ err }, "TeamUp sync error");
  }

  return { clientsUpdated, attendanceAdded };
}

async function recalculateAttendanceAverages() {
  const clients = await db.select().from(clientsTable);

  const now = new Date();
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  const fourWeeksAgoStr = fourWeeksAgo.toISOString().split("T")[0];

  for (const client of clients) {
    const records = await db
      .select()
      .from(attendanceRecordsTable)
      .where(eq(attendanceRecordsTable.clientId, client.id));

    const recentRecords = records.filter((r) => r.date >= fourWeeksAgoStr);
    const weeklyAvg = recentRecords.length / 4;

    const lastRecord = records.sort((a, b) => b.date.localeCompare(a.date))[0];
    const lastDate = lastRecord?.date || null;

    // Calculate engagement based on last attendance
    let engagementStatus = "unknown";
    if (lastDate) {
      const daysSinceLastAttendance = Math.floor(
        (now.getTime() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceLastAttendance <= 7) engagementStatus = "active";
      else if (daysSinceLastAttendance <= 14) engagementStatus = "at_risk";
      else engagementStatus = "disengaged";
    }

    await db
      .update(clientsTable)
      .set({
        weeklyAttendanceAvg: weeklyAvg,
        lastAttendanceDate: lastDate,
        engagementStatus,
        lastSyncedAt: now.toISOString(),
      })
      .where(eq(clientsTable.id, client.id));
  }
}
