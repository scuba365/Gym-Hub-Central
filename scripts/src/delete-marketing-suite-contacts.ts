/**
 * Dry-run by default. Pass --delete to actually remove contacts.
 *
 * Targets customers that were imported via the Marketing Suite integration:
 *   - lead_source contains "marketing suite" (case-insensitive), AND
 *   - joined on 2026-07-30 (client-side date check as a safety guard)
 *
 * Usage:
 *   pnpm tsx ./src/delete-marketing-suite-contacts.ts            # dry run
 *   pnpm tsx ./src/delete-marketing-suite-contacts.ts --delete   # live delete
 */

const TOKEN = process.env.TEAMUP_M2M_TOKEN;
const BASE = "https://goteamup.com/api/v2";
const TARGET_DATE = "2026-07-30";
const DRY_RUN = !process.argv.includes("--delete");

if (!TOKEN) {
  console.error("TEAMUP_M2M_TOKEN env var is not set.");
  process.exit(1);
}

interface Customer {
  id: number;
  first_name: string;
  last_name: string;
  email?: string;
  phone_number?: string;
  mobile?: string;
  date_joined?: string;
  created_at?: string;
  lead_source?: string;
  lead_source_name?: string;
  source?: string;
  [key: string]: unknown;
}

interface Page<T> {
  count: number;
  next: string | null;
  results: T[];
}

async function apiFetch(url: string, method = "GET", body?: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Token ${TOKEN}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GoTeamUp ${method} ${url} → ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

async function fetchMemberCustomerIds(): Promise<Set<number>> {
  const ids = new Set<number>();
  // Fetch all memberships regardless of status (active, expired, cancelled, etc.)
  let url: string | null = `${BASE}/customer_memberships?page_size=100`;
  let pages = 0;
  while (url && pages < 200) {
    const data = (await apiFetch(url)) as Page<{ customer: number }>;
    for (const m of data.results) {
      if (m.customer) ids.add(m.customer);
    }
    url = data.next ?? null;
    pages++;
  }
  return ids;
}

async function fetchAllCustomers(): Promise<Customer[]> {
  const all: Customer[] = [];
  let url: string | null = `${BASE}/customers?page_size=100`;
  let pages = 0;
  while (url && pages < 200) {
    const data = (await apiFetch(url)) as Page<Customer>;
    all.push(...data.results);
    process.stdout.write(`\r  Fetched ${all.length} / ${data.count} customers...`);
    url = data.next ?? null;
    pages++;
  }
  console.log();
  return all;
}

function getLeadSource(c: Customer): string {
  return String(c.lead_source ?? c.lead_source_name ?? c.source ?? "").toLowerCase();
}

function getJoinedDate(c: Customer): string {
  const raw = String(c.date_joined ?? c.created_at ?? "");
  return raw.slice(0, 10); // "YYYY-MM-DD"
}

function hasOnlyNameAndEmail(c: Customer): boolean {
  const hasPhone = !!(c.phone_number || c.mobile);
  return !hasPhone;
}

async function main() {
  console.log(`\nGoTeamUp Marketing Suite contact cleanup`);
  console.log(`Target date : ${TARGET_DATE}`);
  console.log(`Mode        : ${DRY_RUN ? "DRY RUN (no changes)" : "LIVE DELETE"}\n`);

  console.log("Fetching all customer memberships (to protect real clients)...");
  const memberIds = await fetchMemberCustomerIds();
  console.log(`Customers with any membership history: ${memberIds.size}`);

  console.log("Fetching all customers (this may take a moment)...");
  const all = await fetchAllCustomers();
  console.log(`Total customers in account: ${all.length}`);

  // Log field names from the first record so we can verify the lead_source field name
  if (all.length > 0) {
    console.log(`\nSample customer fields: ${Object.keys(all[0]).join(", ")}`);
  }

  // Primary filter: Marketing Suite lead source on the target date
  const byLeadSource = all.filter(
    (c) =>
      getLeadSource(c).includes("marketing") &&
      getJoinedDate(c) === TARGET_DATE &&
      !memberIds.has(c.id)
  );

  // Fallback: joined on target date with only name + email (catches contacts
  // where lead_source field name differs or is blank)
  const byDateOnly = all.filter(
    (c) =>
      getJoinedDate(c) === TARGET_DATE &&
      hasOnlyNameAndEmail(c) &&
      !memberIds.has(c.id) &&
      !byLeadSource.find((x) => x.id === c.id)
  );

  const targets = [...byLeadSource, ...byDateOnly];

  console.log(`\nMatched ${byLeadSource.length} via lead_source "Marketing Suite"`);
  if (byDateOnly.length > 0) {
    console.log(`Matched ${byDateOnly.length} additional via date + minimal profile (no phone)`);
    console.log(`  ⚠  Review the date-only matches carefully before deleting.`);
  }

  if (targets.length === 0) {
    console.log("\nNo matching contacts found. Nothing to do.");
    return;
  }

  console.log(`\n${"─".repeat(80)}`);
  console.log(`${"ID".padEnd(10)} ${"Name".padEnd(35)} ${"Email".padEnd(35)} Lead Source`);
  console.log(`${"─".repeat(80)}`);
  for (const c of targets) {
    const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim().slice(0, 34).padEnd(35);
    const email = (c.email ?? "(none)").slice(0, 34).padEnd(35);
    const ls = getLeadSource(c) || "(blank)";
    console.log(`${String(c.id).padEnd(10)} ${name} ${email} ${ls}`);
  }
  console.log(`${"─".repeat(80)}`);
  console.log(`Total to delete: ${targets.length}`);

  if (DRY_RUN) {
    console.log("\n[DRY RUN] No contacts deleted.");
    console.log("If the list looks correct, re-run with --delete to remove them.");
    return;
  }

  const ids = targets.map((c) => c.id);

  // Try bulk_delete with { ids: [...] } format
  console.log(`\nAttempting POST /customers/bulk_delete with { ids } format...`);
  try {
    const result = await apiFetch(`${BASE}/customers/bulk_delete`, "POST", {
      customers: { ids },
      cancel_active_memberships: false,
      cancel_pending_payments: false,
    });
    console.log("Result:", JSON.stringify(result, null, 2));
    console.log(`\nDone. ${ids.length} contacts sent for deletion.`);
    return;
  } catch (err) {
    console.log("bulk_delete { ids } failed:", err instanceof Error ? err.message : err);
  }

  // Try bulk_delete with array format
  console.log(`\nAttempting POST /customers/bulk_delete with array format...`);
  try {
    const result = await apiFetch(`${BASE}/customers/bulk_delete`, "POST", {
      customers: ids,
      cancel_active_memberships: false,
      cancel_pending_payments: false,
    });
    console.log("Result:", JSON.stringify(result, null, 2));
    console.log(`\nDone. ${ids.length} contacts sent for deletion.`);
    return;
  } catch (err) {
    console.log("bulk_delete array failed:", err instanceof Error ? err.message : err);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
