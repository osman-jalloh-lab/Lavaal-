#!/usr/bin/env node
// Fake Preview demo data for /ops. Off by default.
// Writes one labelled office blob and nothing else.
// Refuses production, refuses an unprefixed key, never prints tokens.

const storeEnv = require('../../api/ops/_store-env');

function refuse(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  if (process.env.SEED_PREVIEW_DEMO !== '1') {
    refuse('Refusing. SEED_PREVIEW_DEMO is off. Set SEED_PREVIEW_DEMO=1 to write fake Preview demo data.');
  }
  if (storeEnv.deploymentEnv() !== 'preview') {
    refuse('Refusing. This script runs only when VERCEL_ENV=preview.');
  }
  if (!storeEnv.separationGuaranteed()) {
    refuse('Refusing. Preview isolation is not guaranteed.');
  }
  if (!storeEnv.kvConfigured()) {
    refuse('Refusing. No Preview KV client is configured.');
  }
  const officeKey = storeEnv.key(storeEnv.PRODUCTION_KEYS.office);
  if (officeKey !== `preview:${storeEnv.PRODUCTION_KEYS.office}`) {
    refuse('Refusing. Office key is not the Preview name.');
  }
  const now = Date.now();
  const demo = {
    demoLabel: 'FAKE preview demo — not founder records',
    goal: {
      title: 'DEMO: Preview store is empty of founder data',
      definitionOfDone: 'Fake row only. Safe to delete.',
      nextStep: 'Ignore this goal',
      targetDate: '',
      updatedAt: now,
    },
    profiles: {},
    projects: [],
    tasks: [{
      id: 'demo000000000001',
      title: 'DEMO task — not real work',
      status: 'todo',
      nextAction: 'Delete this demo task',
      due: '',
      projectId: '',
      createdAt: now,
      updatedAt: now,
      createdBy: 'demo@example.com',
    }],
    notes: [],
    chats: [],
    inbox: [],
    mailAudit: [],
    events: [],
    routines: [],
    kits: [],
    issues: [],
    pendingBookings: [],
    assignSeq: 0,
    researchyPending: [],
  };
  await storeEnv.kvCommand(['SET', officeKey, JSON.stringify(demo)]);
  console.log(`Wrote fake demo office blob to ${officeKey}. Not founder data.`);
}

main().catch((err) => {
  const code = err && (err.code || err.message) ? (err.code || err.message) : 'seed_failed';
  console.error(code);
  process.exit(1);
});
