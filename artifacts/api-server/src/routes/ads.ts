import { Router } from "express";
import { logger } from "../lib/logger";
import { GOTEAMUP_BASE, PAGE_SIZE, goteamupFetchAll } from "../lib/goteamup";

const router = Router();
const GRAPH_BASE = "https://graph.facebook.com/v20.0";
const WEEKS_BACK = 8;

const TRIAL_PLAN_NAMES = new Set([
  "30 day trial",
  "atc starter pass",
  "6 week challenge",
]);

interface MetaInsightRow {
  date_start: string;
  date_stop: string;
  spend: string;
  impressions: string;
  inline_link_clicks: string;
  ctr: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
}

interface GTUMembership {
  id: number;
  customer: number;
  membership: unknown;
  name: string;
  status: string;
  start_date: string | null;
  price?: string | number | null;
}

function sumAction(
  actions: Array<{ action_type: string; value: string }> | undefined,
  types: string[]
): number {
  if (!actions) return 0;
  return actions
    .filter((a) => types.includes(a.action_type))
    .reduce((sum, a) => sum + parseFloat(a.value), 0);
}

function extractPrice(mem: GTUMembership): number {
  if (mem.price != null) {
    const p = typeof mem.price === "string" ? parseFloat(mem.price) : Number(mem.price);
    if (!isNaN(p) && p > 0) return p;
  }
  if (mem.membership != null && typeof mem.membership === "object") {
    const nested = mem.membership as Record<string, unknown>;
    const p = typeof nested.price === "string" ? parseFloat(nested.price) : Number(nested.price ?? 0);
    if (!isNaN(p) && p > 0) return p;
  }
  return 0;
}

router.get("/ads/meta", async (req, res) => {
  const metaToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  const gtuToken = process.env.TEAMUP_M2M_TOKEN;

  if (!metaToken || !adAccountId) {
    return res.status(503).json({ error: "META_ACCESS_TOKEN or META_AD_ACCOUNT_ID not configured" });
  }

  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - WEEKS_BACK * 7);

    const since = startDate.toISOString().split("T")[0];
    const until = endDate.toISOString().split("T")[0];

    const fields = ["spend", "impressions", "inline_link_clicks", "ctr", "actions", "action_values"].join(",");

    const insightsUrl =
      `${GRAPH_BASE}/${adAccountId}/insights` +
      `?fields=${encodeURIComponent(fields)}` +
      `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}` +
      `&time_increment=7` +
      `&level=account` +
      `&access_token=${metaToken}`;

    // Fetch Meta insights + account info in parallel
    // Also fetch GoTeamUp memberships if token is available
    const [insightsResp, accountResp, gtuMemberships] = await Promise.all([
      fetch(insightsUrl),
      fetch(`${GRAPH_BASE}/${adAccountId}?fields=name,currency&access_token=${metaToken}`),
      gtuToken
        ? goteamupFetchAll<GTUMembership>(
            `${GOTEAMUP_BASE}/customer_memberships?page_size=${PAGE_SIZE}&status=active`,
            gtuToken
          ).catch(() => [] as GTUMembership[])
        : Promise.resolve([] as GTUMembership[]),
    ]);

    if (!insightsResp.ok) {
      const err = await insightsResp.json();
      logger.error({ err }, "Meta Ads: insights API error");
      return res.status(502).json({ error: "Meta API error", detail: err });
    }

    const insightsData = (await insightsResp.json()) as { data: MetaInsightRow[] };
    const accountData = accountResp.ok ? ((await accountResp.json()) as { name?: string; currency?: string }) : {};

    // Filter GTU memberships to trial/challenge plans started within our window
    const trialMemberships = gtuMemberships.filter((m) => {
      if (!TRIAL_PLAN_NAMES.has((m.name ?? "").toLowerCase().trim())) return false;
      if (!m.start_date) return false;
      return m.start_date >= since && m.start_date <= until;
    });

    const LEAD_TYPES = ["lead", "onsite_conversion.lead_grouped", "contact"];
    const PURCHASE_TYPES = ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"];

    const weeks = (insightsData.data ?? []).map((row) => {
      // Count GTU signups whose start_date falls in this Meta week
      const weekSignups = trialMemberships.filter(
        (m) => m.start_date! >= row.date_start && m.start_date! <= row.date_stop
      );
      const gtuSales = weekSignups.length;
      const gtuRevenue = weekSignups.reduce((sum, m) => sum + extractPrice(m), 0);

      return {
        weekStart: row.date_start,
        weekEnd: row.date_stop,
        spend: parseFloat(row.spend ?? "0"),
        impressions: parseInt(row.impressions ?? "0", 10),
        clicks: parseInt(row.inline_link_clicks ?? "0", 10),
        ctr: parseFloat(row.ctr ?? "0"),
        leads: Math.round(sumAction(row.actions, LEAD_TYPES)),
        conversions: Math.round(sumAction(row.actions, PURCHASE_TYPES)),
        conversionValue: sumAction(row.action_values, PURCHASE_TYPES),
        gtuSales,
        gtuRevenue,
      };
    });

    logger.info(
      { weeks: weeks.length, gtuSignups: trialMemberships.length },
      "Meta Ads: fetched insights + GTU sales"
    );

    return res.json({
      weeks,
      currency: accountData.currency ?? "EUR",
      adAccountName: accountData.name ?? adAccountId,
      gtuConnected: !!gtuToken,
    });
  } catch (err) {
    logger.error({ err }, "Meta Ads: fetch failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
