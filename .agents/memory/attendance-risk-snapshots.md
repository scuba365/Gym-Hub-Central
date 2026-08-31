---
name: Attendance risk snapshots
description: How time windows for attendance-drop alerts should align with synced data.
---

Attendance-drop risk calculations must end their recent attendance window at the client’s latest successful sync date rather than at wall-clock today.

**Why:** External attendance data can be days or weeks old between manual syncs. Comparing a stored rolling average from the last sync with an empty present-day window falsely flags otherwise healthy clients.

**How to apply:** Any derived attendance trend or alert that compares against synced aggregates should use the same data snapshot date. Fall back to today only when no sync timestamp exists.