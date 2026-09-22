// PDF viewing uses the untouched original bytes in the browser. On Sites, text
// extraction runs in the existing E2B trusted reader instead of parsing arbitrary
// PDF streams inside the memory/CPU-limited request Worker. Its admitted profile
// replaces verificationPages before document analysis and evidence validation.
// This module is selected explicitly by the Sites build, not as an error fallback.
export async function pdfText() {
  return [];
}
