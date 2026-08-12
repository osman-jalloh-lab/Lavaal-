import fs from 'node:fs/promises';
import path from 'node:path';

export function createReport() {
  return {
    startedAt: new Date().toISOString(),
    finishedAt: null,
    requested: 0,
    accepted: 0,
    skipped: [],
    failed: [],
    imagesDownloaded: 0,
    imagesSkipped: [],
    duplicates: []
  };
}

export function addSkipped(report, item, reason) { report.skipped.push({ item, reason }); }
export function addFailed(report, item, reason) { report.failed.push({ item, reason }); }
export function addImageSkipped(report, item, reason) { report.imagesSkipped.push({ item, reason }); }

export async function writeReport(reportsDir, report) {
  report.finishedAt = new Date().toISOString();
  await fs.mkdir(reportsDir, { recursive: true });
  const filename = `import-${report.startedAt.replace(/[:.]/g, '-')}.json`;
  const destination = path.join(reportsDir, filename);
  await fs.writeFile(destination, `${JSON.stringify(report, null, 2)}\n`);
  return destination;
}
