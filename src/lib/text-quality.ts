export function normalizeDisplayText(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/\u0000/g, "")
    .normalize("NFC");
}

export function hasLikelyEncodingDamage(value: string) {
  if (!value) return false;
  const replacementCount = (value.match(/\uFFFD/g) ?? []).length;
  const questionCount = (value.match(/\?/g) ?? []).length;
  const visibleLength = value.replace(/\s/g, "").length || 1;
  return replacementCount > 0 || (questionCount >= 4 && questionCount / visibleLength > 0.2);
}
