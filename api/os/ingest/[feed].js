// api/os/ingest/[feed].js — authenticated POST feeds for LAVAALL OS.
//   POST /api/os/ingest/morning-brief | routine-health | spend | outreach-stats | desk-status
// One dynamic function serves all five (the project is near the Vercel function limit, and no vercel.json
// change is needed). Bearer auth with OPS_CEO_BRIDGE_SECRET; see api/os/_data/INGEST.md.
// /os itself stays read-only: it only reads what these write.

const { handleIngest } = require('../../ops/_os_ingest');

module.exports = async function handler(req, res) {
  return handleIngest(req, res);
};
