---
name: sales-live-data
description: Placeholder interface for future live price, inventory, and logistics checks. Disabled by default in v1.
---

# Sales Live Data

This skill is intentionally disabled by default in v1.

Use it only when live business systems are actually connected. Until then, it exists to make the limitation explicit.

## Command

```bash
node "$SKILLS_ROOT/sales-live-data/scripts/query.js" "price for byd atto 3"
```

## Current Behavior

- Returns `configured: false`
- Tells you to clarify or hand off instead of inventing a live answer

## Rules

- Never fabricate live inventory, live quotation, or live shipping status.
- If this skill reports unconfigured, do not turn that into a definitive customer promise.
