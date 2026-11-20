// Vercel cron target for the no-runs alarm. Logic lives in
// api/ops/_no_runs_alarm.js (underscore prefix, not a function).
// Flag defaults off. Protected by CRON_SECRET. No secrets in this file.

const { handleNoRunsAlarm } = require('./ops/_no_runs_alarm');

module.exports = async function noRunsAlarm(req, res) {
  return handleNoRunsAlarm(req, res);
};
