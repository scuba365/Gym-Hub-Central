---
name: GoTeamUp API quirks
description: Working filter params, pagination gotchas, and active-member strategy for the GoTeamUp v2 API
---

# GoTeamUp API quirks

## Active members
- `GET /customer_memberships?status=active` returns **customer-membership assignments** (80 active for this gym). This is the right endpoint to find who currently has an active membership.
- `GET /memberships?status=active` returns membership **plan templates** (49 plans) — not useful for finding active clients.
- `GET /customers?participating=true` returns 499 customers (all-time, not just active). Always cross-filter against active customer_membership IDs.

**Why:** The gym has ~500 historical clients but only ~80 currently paying. Syncing all 499 clutters the dashboard.

**How to apply:** Always call `customer_memberships?status=active` first, build a Set of customer IDs, then only upsert those to the DB.

## Event date filtering
- `?starts_at_gte=YYYY-MM-DD` — **works correctly** (confirmed: 1,818 events for last 28 days)
- `?starts_at_lte=YYYY-MM-DD` — **add this as an upper bound capped to TODAY**. Without it, GoTeamUp returns future recurring-class instances (the gym books sessions weeks in advance). This causes attendance records to be stored with future dates, which fall outside the chart window.
- `?start_date=`, `?from_date=`, `?from=`, `?date_from=` — all **ignored** (still return 21,444 total)
- `?ordering=-starts_at` — **ignored** (events sorted by template ID, not date)

**Why:** Events are sorted by their recurring-series ID, not chronologically. The "last page" is not the most recent events. Without `starts_at_lte=TODAY`, the API returns advance-booked future sessions alongside past ones.

**How to apply:** Always use BOTH `starts_at_gte` and `starts_at_lte=TODAY`. Also add a code-level guard: skip any event where `ev.starts_at.split("T")[0] > todayStr` (belt-and-suspenders in case the API param is ignored).

## Attendance filtering
- `?customer=<id>` — **works** (returns all attendances for that customer; 813+ records per active member)
- `?event=<id>` — **works** (returns all attendances for a specific event)
- `?ordering=-id` — **works** on the attendances endpoint (newest bookings first)
- `?ordering=-id` applied per customer with early-stop (2 consecutive empty pages) gives recent attendance efficiently
- Status `"not_registered"` is filtered out. Status `"registered"` (future bookings) is included — but since events are now capped to today, future registrations won't appear.

## Pagination
- The `next` field in paginated responses is a **full URL** (e.g. `https://goteamup.com/api/v2/customers?page=2&page_size=100`).
- **Do NOT strip the path and re-prepend the base** — that doubles `/api/v2/` and causes a 404.
- Always pass `data.next` directly to the next fetch call.

## Auth
- Header: `Authorization: Token <TEAMUP_M2M_TOKEN>`
- Also send `Accept: application/json` and `Content-Type: application/json` on every request.
