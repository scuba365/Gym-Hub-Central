import { Router } from "express";
import { logger } from "../lib/logger";

const router = Router();
const GRAPH_BASE = "https://graph.facebook.com/v20.0";
const WEEKS_BACK = 8;

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

function sumAction(
  actions: Array<{ action_type: string; value: string }> | undefined,
  types: string[]
): number {
  if (!actions) return 0;
  return actions
    .filter((a) => types.includes(a.action_type))
    .reduce((sum, a) => sum + parseFloat(a.value), 0);
}

router.get("/ads/meta", async (req, res) => {
  const token = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;

  if (!token || !adAccountId) {
    return res.status(503).json({ error: "META_ACCESS_TOKEN or META_AD_ACCOUNT_ID not configured" });
  }

  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - WEEKS_BACK * 7);

    const since = startDate.toISOString().split("T")[0];
    const until = endDate.toISOString().split("T")[0];

    const fields = [
      "spend",
      "impressions",
      "inline_link_clicks",
      "ctr",
      "actions",
      "action_values",
    ].join(",");

    const insightsUrl =
      `${GRAPH_BASE}/${adAccountId}/insights` +
      `?fields=${encodeURIComponent(fields)}` +
      `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}` +
      `&time_increment=7` +
      `&level=account` +
      `&access_token=${token}`;

    const [insightsResp, accountResp] = await Promise.all([
      fetch(insightsUrl),
      fetch(`${GRAPH_BASE}/${adAccountId}?fields=name,currency&access_token=${token}`),
    ]);

    if (!insightsResp.ok) {
      const err = await insightsResp.json();
      logger.error({ err }, "Meta Ads: insights API error");
      return res.status(502).json({ error: "Meta API error", detail: err });
    }

    const insightsData = (await insightsResp.json()) as { data: MetaInsightRow[] };
    const accountData = accountResp.ok ? ((await accountResp.json()) as { name?: string; currency?: string }) : {};

    const LEAD_TYPES = ["lead", "onsite_conversion.lead_grouped", "contact"];
    const PURCHASE_TYPES = [
      "purchase",
      "offsite_conversion.fb_pixel_purchase",
      "omni_purchase",
    ];

    const weeks = (insightsData.data ?? []).map((row) => ({
      weekStart: row.date_start,
      weekEnd: row.date_stop,
      spend: parseFloat(row.spend ?? "0"),
      impressions: parseInt(row.impressions ?? "0", 10),
      clicks: parseInt(row.inline_link_clicks ?? "0", 10),
      ctr: parseFloat(row.ctr ?? "0"),
      leads: Math.round(sumAction(row.actions, LEAD_TYPES)),
      conversions: Math.round(sumAction(row.actions, PURCHASE_TYPES)),
      conversionValue: sumAction(row.action_values, PURCHASE_TYPES),
    }));

    logger.info({ weeks: weeks.length }, "Meta Ads: fetched insights");
    return res.json({
      weeks,
      currency: accountData.currency ?? "EUR",
      adAccountName: accountData.name ?? adAccountId,
    });
  } catch (err) {
    logger.error({ err }, "Meta Ads: fetch failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
