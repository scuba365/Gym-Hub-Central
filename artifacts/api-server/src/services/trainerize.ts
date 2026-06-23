import { db } from "@workspace/db";
import { clientsTable, trainingSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const TRAINERIZE_BASE_URL = "https://api.trainerize.com/v1";

interface TrainerizeClient {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  photo_url?: string;
}

interface TrainerizeWorkout {
  id: string;
  client_id: string;
  date: string;
  name: string;
  status: "completed" | "assigned" | "skipped";
}

async function trainerizeRequest(path: string, apiKey: string, accountId: string): Promise<any> {
  const response = await fetch(`${TRAINERIZE_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "X-Account-Id": accountId,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Trainerize API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<any>;
}

export async function syncTrainerize(): Promise<{ clientsUpdated: number; sessionsAdded: number }> {
  const apiKey = process.env.TRAINERIZE_API_KEY;
  const accountId = process.env.TRAINERIZE_ACCOUNT_ID;

  if (!apiKey || !accountId) {
    logger.warn("Trainerize credentials not configured (TRAINERIZE_API_KEY, TRAINERIZE_ACCOUNT_ID)");
    return { clientsUpdated: 0, sessionsAdded: 0 };
  }

  let clientsUpdated = 0;
  let sessionsAdded = 0;

  try {
    // Fetch all clients
    const clientsData = await trainerizeRequest("/clients", apiKey, accountId);
    const trainerizeClients: TrainerizeClient[] = clientsData.clients || clientsData || [];

    for (const tc of trainerizeClients) {
      const name = `${tc.first_name} ${tc.last_name}`.trim();
      const email = tc.email?.toLowerCase();

      // Find or create client
      let client = null;
      if (email) {
        const found = await db
          .select()
          .from(clientsTable)
          .where(eq(clientsTable.email, email))
          .limit(1);
        client = found[0];
      }

      if (!client) {
        const found = await db
          .select()
          .from(clientsTable)
          .where(eq(clientsTable.trainerizeId, tc.id))
          .limit(1);
        client = found[0];
      }

      if (!client) {
        const [newClient] = await db
          .insert(clientsTable)
          .values({
            name,
            email: email || null,
            photoUrl: tc.photo_url || null,
            trainerizeId: tc.id,
          })
          .returning();
        client = newClient;
        clientsUpdated++;
      } else {
        await db
          .update(clientsTable)
          .set({
            trainerizeId: tc.id,
            photoUrl: tc.photo_url || client.photoUrl,
          })
          .where(eq(clientsTable.id, client.id));
      }

      // Fetch workout sessions for this client (last 60 days)
      try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 60);

        const workoutsData = await trainerizeRequest(
          `/clients/${tc.id}/workouts?start=${startDate.toISOString().split("T")[0]}&end=${endDate.toISOString().split("T")[0]}`,
          apiKey,
          accountId
        );

        const workouts: TrainerizeWorkout[] = workoutsData.workouts || workoutsData || [];

        for (const w of workouts) {
          const externalId = `trainerize-${w.id}`;
          const existing = await db
            .select()
            .from(trainingSessionsTable)
            .where(eq(trainingSessionsTable.externalId, externalId))
            .limit(1);

          if (existing.length === 0) {
            await db.insert(trainingSessionsTable).values({
              clientId: client.id,
              date: w.date,
              workoutName: w.name || null,
              completed: w.status === "completed",
              externalId,
            });
            sessionsAdded++;
          }
        }

        // Calculate workout compliance for this client
        const totalAssigned = workouts.length;
        const completed = workouts.filter((w) => w.status === "completed").length;
        const compliancePct = totalAssigned > 0 ? (completed / totalAssigned) * 100 : null;

        // Find last training date
        const sortedDates = workouts
          .filter((w) => w.status === "completed")
          .map((w) => w.date)
          .sort((a, b) => b.localeCompare(a));
        const lastTrainingDate = sortedDates[0] || null;

        // Write training metrics only; engagement status is computed centrally
        // after all sync sources complete (see computeAllEngagementStatuses in sync.ts).
        await db
          .update(clientsTable)
          .set({
            workoutCompliancePct: compliancePct,
            lastTrainingDate,
          })
          .where(eq(clientsTable.id, client.id));
      } catch (err) {
        logger.warn({ err, clientId: tc.id }, "Failed to fetch Trainerize workouts for client");
      }
    }
  } catch (err) {
    logger.error({ err }, "Trainerize sync error");
    throw err;
  }

  return { clientsUpdated, sessionsAdded };
}
