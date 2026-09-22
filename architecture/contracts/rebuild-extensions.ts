/** OPTIONAL_FUTURE only; excluded from CURRENT_REPRODUCTION public DTOs and acceptance.
 * None of these fields exists in the frozen product. Do not add them while reproducing it.
 * Optional budgets/semantics: specs/08-rebuild-coverage-geometry.md. Product execution NOT_RUN.
 */
export type PageWindowRequest = {
  documentId: string; sourceSha256: string; windowId: string;
  /** Positive safe integers, physical page numbers; end-start+1 <= 8. */
  startPage: number; endPage: number; expectedPageCount: number;
  /** Remaining total gate budget; never extends the enclosing deadline. */
  deadlineEpochMs: number;
};
export type PageWindowResult = {
  documentId: string; sourceSha256: string; windowId: string;
  readerPages: number[]; contextPages: number[]; visualPages: number[];
  omissions: { page: number; stage: 'reader'|'context'|'visual'; reason: string }[];
  attempts: number; status: 'complete'|'partial'|'failed'|'cancelled';
};
export type EvidenceGeometry = {
  itemId: string; documentId: string; sourceSha256: string;
  physicalPage: number; quote: string;
  /** Coordinates in the displayed physical page AFTER rotation, including both halves of 2-up. */
  bbox: [x0: number, y0: number, x1: number, y1: number];
  rotation: 0|90|180|270;
  locator: 'pdf-text-layer'|'visual-page-locator';
  /** Assigned by host after identity/range/witness checks and independent visual verification. */
  verification: 'verified';
};
export type OptionalGeometrySnapshotExtension = { evidenceGeometry?: EvidenceGeometry[] };
/** This structured response is a candidate, never directly a trusted EvidenceGeometry. */
export type VisualLocatorResponse = {
  candidates: { itemId: string; quote: string; bbox: [number,number,number,number] }[];
  uncertainItemIds: string[];
};
export type VisualGeometryVerifierResponse = {
  results: { itemId: string; candidateIndex: number; verified: boolean; reason: 'match'|'wrong-text'|'wrong-anchor'|'occluded'|'invalid-region'|'uncertain' }[];
};
