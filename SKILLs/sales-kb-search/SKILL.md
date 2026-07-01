---
name: sales-kb-search
description: Search the layered sales knowledge base under sales-kb and return evidence with source paths.
---

# Sales KB Search

Use this skill when you need grounded evidence from the static sales knowledge base.

## What This Skill Does

- Searches files under `sales-kb/`
- Returns the most relevant snippets
- Gives source file paths you can place into `citations`

## What This Skill Does Not Do

- It does not decide whether a reply is safe to send
- It does not provide live inventory, live price, or live logistics data

## Command

Always prefer this script over manually guessing file contents:

```bash
node "$SKILLS_ROOT/sales-kb-search/scripts/search.js" "your query" [knowledge_root]
```

## Examples

```bash
node "$SKILLS_ROOT/sales-kb-search/scripts/search.js" "payment terms deposit balance"
node "$SKILLS_ROOT/sales-kb-search/scripts/search.js" "shipping documents bill of lading" sales-kb
```

## Usage Rules

- Search before answering non-trivial business questions.
- Only cite files returned by the script.
- If the script returns no relevant evidence, do not pretend the answer is known.
- For price and inventory questions, static evidence alone is often not enough for a firm commitment.
