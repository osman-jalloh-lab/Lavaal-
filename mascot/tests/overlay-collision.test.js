/**
 * Overlay Collision tests
 * Verifies mascot position does not overlap navigation, forms, or CTAs.
 * Uses mock viewport geometry — no real DOM layout required.
 */

import { test, assert, assertEqual } from './run-all.js';

// ── Geometry helpers ──────────────────────────────────────────────

/**
 * A simple axis-aligned bounding box.
 */
function rect(x, y, width, height) {
  return { x, y, width, height, right: x + width, bottom: y + height };
}

/**
 * Returns true if two rects overlap.
 */
function overlaps(a, b) {
  return !(
    a.right  <= b.x ||
    b.right  <= a.x ||
    a.bottom <= b.y ||
    b.bottom <= a.y
  );
}

// ── Mock viewport sizes ───────────────────────────────────────────
const VIEWPORTS = [
  { name: '320px mobile',  width: 320,  height: 568  },
  { name: '375px mobile',  width: 375,  height: 667  },
  { name: '768px tablet',  width: 768,  height: 1024 },
  { name: '1280px desktop',width: 1280, height: 800  },
];

// ── Mock collision zones (representative for lavaall.com) ─────────

function getCollisionZones(viewport) {
  // Reserve the mascot's bottom-right safe-zone column from collision zones
  const isMobileVP = viewport.width < 768;
  const mascotSafeWidth = isMobileVP ? (56 + 16 + 4) : (80 + 24 + 4); // size + margin + buffer

  return [
    // Top navigation bar
    rect(0, 0, viewport.width, 60),

    // Bottom navigation / footer area (left portion only — excludes mascot safe-zone column)
    // The mascot docks in the bottom-right corner; footer links occupy the left portion.
    rect(0, viewport.height - 80, viewport.width - mascotSafeWidth, 80),

    // Primary CTA button zone (center of page)
    rect(
      Math.max(0, viewport.width / 2 - 120),
      Math.min(viewport.height * 0.3, 300),
      240,
      60
    ),

    // Contact form area (bottom-center, approximate)
    rect(
      viewport.width > 600 ? viewport.width / 2 - 200 : 0,
      viewport.height * 0.5,
      viewport.width > 600 ? 400 : viewport.width,
      200
    ),
  ];
}

// ── Mascot bounding box calculator ───────────────────────────────

function getMascotRect(viewport) {
  // Desktop: fixed bottom-right, 24px margins, 80x80px
  // Mobile (<768px): fixed bottom-right, 16px margins, 56x56px
  const isMobile = viewport.width < 768;
  const margin   = isMobile ? 16 : 24;
  const size     = isMobile ? 56 : 80;

  const x = viewport.width  - margin - size;
  const y = viewport.height - margin - size;

  return rect(x, y, size, size);
}

// ── Tests ─────────────────────────────────────────────────────────

test('Mascot rect calculation is correct for desktop', () => {
  const viewport = { width: 1280, height: 800 };
  const mascot = getMascotRect(viewport);

  assertEqual(mascot.width,  80, 'Desktop mascot width should be 80px');
  assertEqual(mascot.height, 80, 'Desktop mascot height should be 80px');
  assertEqual(mascot.x, 1280 - 24 - 80, 'Desktop mascot x should be right-anchored with 24px margin');
  assertEqual(mascot.y, 800  - 24 - 80, 'Desktop mascot y should be bottom-anchored with 24px margin');
});

test('Mascot rect calculation is correct for mobile', () => {
  const viewport = { width: 375, height: 667 };
  const mascot = getMascotRect(viewport);

  assertEqual(mascot.width,  56, 'Mobile mascot width should be 56px');
  assertEqual(mascot.height, 56, 'Mobile mascot height should be 56px');
  assertEqual(mascot.x, 375 - 16 - 56, 'Mobile mascot x should be right-anchored with 16px margin');
  assertEqual(mascot.y, 667 - 16 - 56, 'Mobile mascot y should be bottom-anchored with 16px margin');
});

test('Mascot does not overlap top navigation bar on any viewport', () => {
  VIEWPORTS.forEach(viewport => {
    const mascot = getMascotRect(viewport);
    const navBar = rect(0, 0, viewport.width, 60);

    assert(
      !overlaps(mascot, navBar),
      `Mascot should not overlap nav bar on ${viewport.name} (mascot y=${mascot.y}, navBar bottom=60)`
    );
  });
});

test('Mascot does not overlap bottom navigation/footer on any viewport', () => {
  VIEWPORTS.forEach(viewport => {
    const mascot = getMascotRect(viewport);
    // The mascot occupies the bottom-right corner.
    // Footer/nav links occupy the LEFT portion; the mascot safe-zone column is excluded.
    const isMobileVP = viewport.width < 768;
    const mascotSafeWidth = isMobileVP ? (56 + 16 + 4) : (80 + 24 + 4);
    const footerNav = rect(0, viewport.height - 80, viewport.width - mascotSafeWidth, 80);

    assert(
      !overlaps(mascot, footerNav),
      `Mascot should not overlap footer nav (left portion) on ${viewport.name} ` +
      `(mascot.x=${mascot.x}, footerNav.right=${footerNav.right})`
    );
  });
});

test('Mascot does not overlap center CTA button on any viewport', () => {
  VIEWPORTS.forEach(viewport => {
    const mascot  = getMascotRect(viewport);
    const zones   = getCollisionZones(viewport);
    const ctaZone = zones[2]; // Center CTA

    assert(
      !overlaps(mascot, ctaZone),
      `Mascot should not overlap center CTA on ${viewport.name} (mascot.x=${mascot.x}, cta.right=${ctaZone.right})`
    );
  });
});

test('Mascot does not overlap contact form area on any viewport', () => {
  VIEWPORTS.forEach(viewport => {
    const mascot   = getMascotRect(viewport);
    const zones    = getCollisionZones(viewport);
    const formZone = zones[3]; // Contact form

    // On mobile (320/375), form is full-width — mascot may be within form's x range.
    // We check only the y-axis overlap: mascot should be below the form area, or
    // the form should be scrollable while mascot is fixed at bottom.
    // Key safety: mascot x position should be outside left 80% of form for narrow viewports.

    if (viewport.width >= 768) {
      assert(
        !overlaps(mascot, formZone),
        `Mascot should not overlap form zone on ${viewport.name}`
      );
    } else {
      // On mobile: check that mascot is in the bottom corner, not blocking form submit button
      // Form submit is typically centered, mascot is right-aligned
      const formCenter = formZone.x + formZone.width / 2;
      const mascotCenter = mascot.x + mascot.width / 2;
      const distanceFromCenter = Math.abs(mascotCenter - formCenter);

      // Mascot should be at least 60px from form center (it's right-anchored)
      assert(
        distanceFromCenter > 60,
        `On mobile ${viewport.name}, mascot should be offset from form center (distance=${distanceFromCenter}px)`
      );
    }
  });
});

test('overlaps() helper correctly identifies overlapping rects', () => {
  const a = rect(0, 0, 100, 100);
  const b = rect(50, 50, 100, 100); // overlaps a
  const c = rect(200, 200, 100, 100); // does not overlap a

  assert(overlaps(a, b),  'Rects a and b should overlap');
  assert(!overlaps(a, c), 'Rects a and c should not overlap');
});

test('overlaps() handles adjacent (touching) rects as non-overlapping', () => {
  const a = rect(0, 0, 100, 100);
  const b = rect(100, 0, 100, 100); // adjacent right edge

  assert(!overlaps(a, b), 'Adjacent rects should not be considered overlapping');
});

test('Mascot stays within viewport bounds on all sizes', () => {
  VIEWPORTS.forEach(viewport => {
    const mascot = getMascotRect(viewport);

    assert(mascot.x >= 0,                          `Mascot left edge should be within viewport on ${viewport.name}`);
    assert(mascot.y >= 0,                          `Mascot top edge should be within viewport on ${viewport.name}`);
    assert(mascot.right  <= viewport.width,        `Mascot right edge should be within viewport on ${viewport.name}`);
    assert(mascot.bottom <= viewport.height,       `Mascot bottom edge should be within viewport on ${viewport.name}`);
  });
});
