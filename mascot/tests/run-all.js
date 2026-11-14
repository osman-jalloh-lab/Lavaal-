/**
 * LAVAALL Mascot Prototype — Test Runner
 * Run: node tests/run-all.js
 * Requires Node.js 18+ with "type":"module" in package.json
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;
const failures = [];

// Simple test helpers injected into each test module
export function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(() => {
        console.log(`  ✓ ${name}`);
        passed++;
      }).catch(err => {
        console.error(`  ✗ ${name}`);
        console.error(`    ${err.message}`);
        failed++;
        failures.push({ name, error: err.message });
      });
    } else {
      console.log(`  ✓ ${name}`);
      passed++;
    }
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
    failures.push({ name, error: err.message });
  }
}

export function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

export function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertNotEqual(actual, unexpected, message) {
  if (actual === unexpected) {
    throw new Error(message || `Expected value to not equal ${JSON.stringify(unexpected)}`);
  }
}

export function assertContains(str, substr, message) {
  if (!String(str).includes(substr)) {
    throw new Error(message || `Expected "${str}" to contain "${substr}"`);
  }
}

export function assertNotContains(str, substr, message) {
  if (String(str).includes(substr)) {
    throw new Error(message || `Expected "${str}" to NOT contain "${substr}"`);
  }
}

// Pending async test promises accumulated by suites
const asyncPromises = [];
export function registerAsync(p) { asyncPromises.push(p); }

// Run a suite and return a promise
async function runSuite(name, importPath) {
  console.log(`\n── ${name} ──`);
  try {
    await import(importPath);
    // Give synchronous tests a moment to settle
    await new Promise(r => setTimeout(r, 50));
  } catch (err) {
    console.error(`  ✗ SUITE FAILED TO LOAD: ${err.message}`);
    failed++;
    failures.push({ name: `${name} (load)`, error: err.message });
  }
}

// Main
async function main() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  LAVAALL Mascot Prototype — Test Suite');
  console.log('═══════════════════════════════════════════');

  await runSuite('MascotController',      './mascot-controller.test.js');
  await runSuite('MockChatAdapter',       './chat-adapter.test.js');
  await runSuite('XSS Safety',            './xss-safety.test.js');
  await runSuite('Reduced Motion',        './reduced-motion.test.js');
  await runSuite('Overlay Collision',     './overlay-collision.test.js');
  await runSuite('v1.2 Regressions',      './v12-regressions.test.js');
  await runSuite('v1.3 Design Kit',       './v13-design-kit.test.js');
  await runSuite('RealChatAdapter',       './real-chat-adapter.test.js');

  // Wait for any async test promises to settle (adapter timing tests)
  if (asyncPromises.length > 0) {
    await Promise.allSettled(asyncPromises);
  }
  // Extra settle time for timer-based async tests (v1.2 adds tests up to 5s)
  await new Promise(r => setTimeout(r, 6500));

  console.log('\n═══════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);

  if (failures.length > 0) {
    console.log('\n  Failures:');
    failures.forEach(f => console.log(`    ✗ ${f.name}: ${f.error}`));
  }

  console.log('═══════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
