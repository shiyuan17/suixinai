#!/usr/bin/env node

const query = String(process.argv.slice(2).join(' ') || '').trim();

console.log(JSON.stringify({
  success: true,
  configured: false,
  status: 'unconfigured',
  query,
  message: 'sales-live-data is not configured in v1. Ask a clarifying question or hand off instead of inventing a live answer.',
}, null, 2));
