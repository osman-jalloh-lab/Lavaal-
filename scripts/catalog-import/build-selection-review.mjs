import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVariantGroups, proposePilot } from './lib/product-grouping.mjs';
const dir = path.dirname(fileURLToPath(import.meta.url));
const input = process.argv[2] ?? path.join(dir, 'discovery', 'enriched-review.json'); const output = process.argv[3] ?? path.join(dir, 'discovery', 'selection-review.json');
const enriched = JSON.parse(await fs.readFile(input, 'utf8')); const groups = buildVariantGroups(enriched.records ?? []); const { proposals, deferred } = proposePilot(groups);
const result = { generatedAt: new Date().toISOString(), source: 'icecat-productxml-metadata-only', sourceRecordCount: enriched.records?.length ?? 0, modelFamilyGroupCount: groups.length, distinctVariantCount: groups.reduce((sum, group) => sum + group.variants.length, 0), groups, pilotProposals: proposals, deferred, exactDuplicateGroups: enriched.exactDuplicateGroups ?? [] };
await fs.writeFile(output, `${JSON.stringify(result, null, 2)}\n`); console.log(`Selection review output: ${path.resolve(output)}`);
