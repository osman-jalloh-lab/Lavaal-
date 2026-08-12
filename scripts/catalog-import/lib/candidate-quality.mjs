const LEGACY_PATTERN = /(windows xp|\bwxp\b|pentium\s*(iii|m)|centrino|cd-rom|dvd-rom|cdrw|\bumpc\b|\bomnibook\b|\bthinkpad\s+(?:t4[23]\w*|r5[01]\w*|x3[14]\w*|x40\w*)\b|\binspiron\s+(1525|1720)\b|\bxps\s+m(1330|1530|2010)\b|\btco(?:95|99|03)\b|\bflatscreen\b|\bgalaxy\s+tab\s+p10(?:00|10)\b|\bgt-p10(?:00|10)\b)/i;

export function legacySignal(modelName = '') {
  const match = String(modelName).match(LEGACY_PATTERN);
  return match?.[0] ?? null;
}

export function meaningfulModelName(modelName = '') {
  const value = String(modelName).trim();
  return Boolean(value) && !/^\d+(?:\.\d+)?$/.test(value);
}

export function candidateQualityVector(candidate) {
  return [
    Number(Boolean(candidate.icecatId)),
    Number(Boolean(candidate.mpn?.trim())),
    Number((candidate.gtins ?? []).length > 0),
    Number(meaningfulModelName(candidate.modelName)),
    Number(Boolean(candidate.previewImageUrl)),
    Math.min((candidate.countryMarkets ?? []).length, 8),
    Number(!legacySignal(candidate.modelName)),
    String(candidate.updated ?? ''),
    String(candidate.icecatId ?? '')
  ];
}

// Positive means a is the stronger review candidate. `updated` is only a weak
// tie-breaker and never represents a release date or modernity claim.
export function compareCandidateQuality(a, b) {
  const left = candidateQualityVector(a); const right = candidateQualityVector(b);
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] === right[index]) continue;
    return left[index] > right[index] ? 1 : -1;
  }
  return 0;
}
