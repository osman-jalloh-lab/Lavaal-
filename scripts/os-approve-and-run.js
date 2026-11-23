#!/usr/bin/env node
'use strict';
const { tick, runnerEnabled } = require('./os-runner');
(async () => {
  if (!runnerEnabled(process.env)) { console.log('OS runner disabled'); return; }
  do {
    const result = await tick();
    console.log('OS runner:', result.state);
    if (result.state === 'not_configured') { process.exitCode = 1; return; }
    if (process.argv.includes('--once')) return;
    await new Promise(resolve => setTimeout(resolve, 5000));
  } while (runnerEnabled(process.env));
})().catch(() => { console.error('OS runner failed'); process.exitCode = 1; });
