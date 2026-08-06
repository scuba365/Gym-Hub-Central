import Anthropic from "@anthropic-ai/sdk";
import type { Client } from "@workspace/db";
import type { AttendanceRecord, InbodyScan } from "@workspace/db";

const MODEL = "claude-sonnet-4-6";

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("AI features require ANTHROPIC_API_KEY to be set");
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function formatAttendanceSummary(attendance: AttendanceRecord[]): string {
  if (!attendance.length) return "No attendance records.";
  const sorted = [...attendance].sort((a, b) => b.date.localeCompare(a.date));
  const lastDate = sorted[0].date;
  const last90 = sorted.filter(r => {
    const d = new Date(r.date);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    return d >= cutoff;
  });
  return `${last90.length} classes in last 90 days. Most recent: ${lastDate}.`;
}

function formatTrainingSummary(client: Client): string {
  const parts: string[] = [];
  if (client.workoutCompliancePct != null) parts.push(`Workout compliance: ${client.workoutCompliancePct}%`);
  if (client.lastTrainingDate) parts.push(`Last training: ${client.lastTrainingDate}`);
  if (client.weeklyAttendanceAvg != null) parts.push(`Weekly avg sessions: ${client.weeklyAttendanceAvg.toFixed(1)}`);
  return parts.length ? parts.join(". ") : "No training data.";
}

function formatScanSummary(scans: InbodyScan[]): string {
  if (!scans.length) return "No InBody scan data.";
  const sorted = [...scans].sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));
  const latest = sorted[0];
  const parts = [`Latest scan: ${latest.scannedAt}`];
  if (latest.weightKg != null) parts.push(`Weight: ${latest.weightKg}kg`);
  if (latest.bodyFatPct != null) parts.push(`Body fat: ${latest.bodyFatPct}%`);
  if (latest.muscleMassKg != null) parts.push(`Muscle mass: ${latest.muscleMassKg}kg`);
  if (latest.bmr != null) parts.push(`BMR: ${latest.bmr} kcal`);
  if (sorted.length >= 2) {
    const prev = sorted[1];
    if (prev.weightKg != null && latest.weightKg != null) {
      const delta = (latest.weightKg - prev.weightKg).toFixed(1);
      parts.push(`Weight change since last scan: ${delta}kg`);
    }
  }
  return parts.join(". ");
}

export async function generateClientInsight(
  client: Client,
  recentAttendance: AttendanceRecord[],
  recentScans: InbodyScan[]
): Promise<string> {
  const anthropic = getClient();

  const prompt = `You are a fitness trainer's assistant. Summarize this client's recent engagement and progress for the trainer's internal notes. Be factual, grounded in the data provided, and write in plain language. 2–4 sentences only.

Client: ${client.name}
Goals: ${client.goals || "Not set"}
Engagement status: ${client.engagementStatus}
Attendance: ${formatAttendanceSummary(recentAttendance)}
Training: ${formatTrainingSummary(client)}
Body composition: ${formatScanSummary(recentScans)}

Write a concise trainer-facing insight summary (not for the client to read).`;

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected response from AI");
  return block.text.trim();
}

export async function generateCheckinDraft(
  client: Client,
  recentAttendance: AttendanceRecord[],
  recentScans: InbodyScan[]
): Promise<string> {
  const anthropic = getClient();

  const firstName = client.name.split(" ")[0];
  const attendanceSummary = formatAttendanceSummary(recentAttendance);

  const prompt = `You are a personal trainer writing a brief, warm check-in message to a client. Write in the trainer's voice, addressed to the client by first name. Reference one concrete recent data point. Keep it 2–4 sentences. Do not make medical claims.

Client first name: ${firstName}
Engagement status: ${client.engagementStatus}
Attendance: ${attendanceSummary}
Training: ${formatTrainingSummary(client)}
Body composition: ${formatScanSummary(recentScans)}
Goals: ${client.goals || "Not set"}

Write only the message text. No subject line, no sign-off.`;

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected response from AI");
  return block.text.trim();
}

export interface MacroTargets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  rationale: string;
}

export async function generateMacroTargets(
  client: Client,
  latestScan: InbodyScan
): Promise<MacroTargets> {
  const anthropic = getClient();

  const scanInfo = [
    latestScan.weightKg != null ? `Weight: ${latestScan.weightKg}kg` : null,
    latestScan.bodyFatPct != null ? `Body fat: ${latestScan.bodyFatPct}%` : null,
    latestScan.muscleMassKg != null ? `Muscle mass: ${latestScan.muscleMassKg}kg` : null,
    latestScan.bmr != null ? `BMR from scan: ${latestScan.bmr} kcal` : null,
  ].filter(Boolean).join(", ");

  const prompt = `You are a sports nutritionist. Calculate daily macro targets for this client using their InBody data and goals. Use the BMR if provided; otherwise estimate using Mifflin-St Jeor from weight. Apply an appropriate TDEE multiplier based on the goals.

Client: ${client.name}
Goals: ${client.goals || "Not specified"}
InBody data: ${scanInfo}

Return ONLY a JSON object with no markdown fences, no explanation, just raw JSON:
{"calories": <number>, "proteinG": <number>, "carbsG": <number>, "fatG": <number>, "rationale": "<one sentence>"}`;

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected response from AI");

  let parsed: MacroTargets;
  try {
    parsed = JSON.parse(block.text.trim()) as MacroTargets;
  } catch {
    throw new Error(`AI returned malformed JSON for macro targets: ${block.text}`);
  }

  if (
    typeof parsed.calories !== "number" ||
    typeof parsed.proteinG !== "number" ||
    typeof parsed.carbsG !== "number" ||
    typeof parsed.fatG !== "number" ||
    typeof parsed.rationale !== "string"
  ) {
    throw new Error(`AI macro targets missing required fields: ${block.text}`);
  }

  return parsed;
}
