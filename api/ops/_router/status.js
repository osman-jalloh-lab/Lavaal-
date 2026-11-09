// Pure task lifecycle helpers for the LAVAALL /ops router.
const STATUSES = Object.freeze({
  RECEIVED: 'RECEIVED',
  CLASSIFIED: 'CLASSIFIED',
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
  BRIDGED: 'BRIDGED',
  DONE: 'DONE',
  FAILED: 'FAILED',
});

function isStatus(value) {
  return Object.values(STATUSES).includes(value);
}

function needsApproval(risk) {
  return risk === 'L3' || risk === 'L4';
}

module.exports = {
  STATUSES,
  isStatus,
  needsApproval,
};
