import type { DocumentKind, DocumentRole, RunDocumentStatus, RunStage, PublicAnalysis, IgnoredSourceNote } from './internal-pipeline';
/** One import entry point for public HTTP DTOs and private pipeline/adapter ports. */
export * from './internal-pipeline';

export type Verdict = 'pending' | 'pass' | 'fail' | 'review';
export type Doc = {
  id: string; name: string; kind: DocumentKind; mime: string; size: number;
  role: DocumentRole; url: string; preview?: DocumentPreview;
  /** Present on run.documents; plain upload/criteriaDocuments have no status. */
  status?: RunDocumentStatus; error?: string;
  analysis?: PublicAnalysis;
  extraction?: DocumentExtraction;
};
/** Public citation allowlist. block/table are private InternalNativeCitation only. */
export type Evidence = { documentId: string; page?: number; sheet?: string; cell?: string; quote?: string; blank?: true };
export type ExcludedCriteriaDocument = { documentId: string; name: string; reason: string };
export type CriteriaDocumentAssessment = ExcludedCriteriaDocument & { status: 'criteria' | 'not_criteria' | 'uncertain'; evidence: Evidence[]; sourceKind?: string };
export type DocumentExtraction = { referenceNumber: string | null; documentType?: string; fields: { label: string; value: string; unit?: string; uncertain?: boolean; evidence?: Evidence[] }[]; warnings?: string[] };
export type Criterion = { id: string; label: string; rule: string; required?: boolean; source?: unknown; sourceDocumentId?:string; sourceName?:string; needsConfirmation?: boolean; categoryPath?:string[]; sampleName?:string; classificationNeedsConfirmation?:boolean; classificationStatus?:'not_applicable'|'ambiguous'|'resolved'; classificationReason?:string; hierarchyEvidence?:(Evidence & {level?:number|string})[]; comparison?: {operator:'lt'|'lte'|'gt'|'gte'|'eq'|'range';value:number;upper?:number;unit:string}; conditions?:string[]; scope?:string; sourceEvidence?:Evidence|Evidence[]; comparatorConfirmed?:boolean; ignoredSourceNotes?:IgnoredSourceNote[] };
export type AnalysisActivity = { id?:string; time?:string; documentId?:string; step:string; title:string; status:string; detail?:string; output?:string; attempt?:number; maxAttempts?:number; roundStatus?:'verified'|'retry'|'needs_review'; issueCount?:number };
export type AnalysisQuality = {
  status: 'verified' | 'needs_review' | 'limited'; attempts: number; maxAttempts: number;
  issues: string[]; stopReason?: string;
  rounds: { attempt: number; status: 'verified' | 'retry' | 'needs_review'; issueCount: number; rereadRanges: string[] }[];
};
export type DocumentAnalysisResult = PublicAnalysis & { documentId: string };
export type Item = {
  id: string; documentId: string; label: string; value: string | number | null; unit?: string;
  criterionId?: string; criterion?: string; status: Verdict; explanation?: string;
  evidence?: Evidence[]; machineStatus?: Verdict; humanNote?: string; reviewedByHuman?: boolean;
  presence?: 'present'|'missing'|'unreadable'|'unknown'; missingVerified?: boolean;
  applicability?: { verified: boolean; reason?: string; targetCategoryPath?: string[]; evidence?: Evidence[] };
};
export type ReviewRun = {
  id: string; status: RunStatus; stage: RunStage; criteria: Criterion[]; items: Item[];
  documents: Doc[]; criterionVersion?: number; summary?: Summary;
  mode?: RunMode;
  criteriaRevision?: number;
  criteriaDocuments?: Doc[];
  excludedCriteriaDocuments?: ExcludedCriteriaDocument[];
  criteriaDocumentAssessments?: CriteriaDocumentAssessment[];
  criteriaGroups?: { id:string; label:string; documentId?:string; criteriaIds:string[] }[];
  criteriaFeedback?: { feedback?:string; documentId?:string; scope?:string; timestamp?:string; [key:string]:unknown }[];
  approvedCriteria?: { criteria:Criterion[]; criterionVersion:number; approvedAt:string } | null;
  events?: ReviewEvent[];
  analyses?: DocumentAnalysisResult[]; analysisActivity?: AnalysisActivity[];
  criteriaDiscovery?: unknown[]; criteriaSources?: unknown[];
};
export type ReviewEvent = {
  type: string; runId: string; sequence: number; timestamp: string;
  documentId?: string; criteria?: Criterion[]; items?: Item[]; item?: Item;
  mode?:string; stage?:string; status?:string; criterionVersion?:number;
  summary?: Record<string, number>; message?: string; [key: string]: unknown;
};
export type Dashboard = { id: string; status: string; message?: string; html?: string; error?: string; attempt?: number };

/** Public frontend declarations above reproduce the frozen baseline's DTOs.
 * Concrete transport/extension types below remove implicit HTTP assumptions.
 * They are structural contracts, not a runtime validator. Normative validation:
 * ../specs/01-state-api.md; deeper extraction fields: ../specs/02-backend-pipeline.md.
 */
export type RunMode = 'criteria_first' | 'legacy';
export type RunStatus = 'running' | 'awaiting_confirmation' | 'awaiting_documents' | 'completed' | 'partial' | 'failed' | 'cancelled';
export type ApiError = { error: string };
export type HealthResponse = { geminiConfigured: boolean; e2bConfigured: boolean; modelExtract: string; modelExplore: string; model: string };
export type DocumentPreview =
  | { type: 'pdf' | 'image' }
  | { type: 'text'; text: string; truncated?: boolean }
  | { type: 'table'; sheets: { name: string; rows: string[][]; state?: string }[]; truncated?: boolean; warnings?: string[] };
export type PublicDocument = Omit<Doc, 'preview'> & { preview: DocumentPreview };
export type UploadResponse = { documents: PublicDocument[] };
export type StartRunRequest = { mode?: RunMode; documentIds?: string[]; criteriaDocumentIds?: string[]; analysisDocumentIds?: string[]; criteriaText?: string };
export type StartRunResponse = { runId: string };
export type DraftState = { mode: 'numeric' | 'qualitative' | 'choose'; operator: '' | 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'range'; value: string; upper: string; unit: string; issues: string[] };
export type SubmittedCriterion = Criterion & { draftState?: DraftState };
export type ConfirmCriteriaRequest = { criteria?: SubmittedCriterion[]; expectedCriterionVersion?: number };
export type ReviseCriteriaRequest = ConfirmCriteriaRequest & { feedback: string; documentId?: string; scope?: string };
export type AttachDocumentsRequest = { documentIds: string[]; analysisDocumentIds?: string[]; expectedCriterionVersion?: number };
export type ResolveItemRequest = { status: Exclude<Verdict, 'pending'>; note: string };
/** server/review.mjs summaryOf, computed from current target documents/items.
 * pending items contribute to total but not pass/fail/review counts. */
export type Summary = {
  /** run.items.length */ total: number;
  /** items with status === 'pass' */ pass: number;
  /** items with status === 'fail' */ fail: number;
  /** items with status === 'review' */ review: number;
  /** run.documents.length; excludes criteria/ledger-only uploads */ documents: number;
  /** documents with status === 'completed' */ completedDocuments: number;
  /** documents with status === 'failed' */ failedDocuments: number;
  /** documents with status === 'partial' ONLY; queued/processing/cancelled/failed excluded */ incompleteDocuments: number;
  /** sum(document.missingRows?.length ?? 0), not missing criterion item count */ unreviewedRows: number;
  /** items with truthy reviewedByHuman */ humanReviewed: number;
};
export type ResolveItemResponse = { item: Item; summary: Summary };
export type CriterionFeedback = { id: string; feedback: string; documentId?: string; scope?: string; status: 'running' | 'completed' | 'failed' | 'cancelled'; createdAt: string; fromVersion: number; completedAt?: string; toVersion?: number; summary?: string; warnings?: string[]; message?: string };
export type AuditEntry =
  | { action: 'criteria.confirmed'; timestamp: string; proposedCriteria: Criterion[]; criteria: Criterion[] }
  | { action: 'criteria.revised'; timestamp: string; feedback: string; documentId?: string; scope?: string; fromVersion: number; toVersion: number; priorDraft: Criterion[]; criteria: Criterion[] }
  | { action: 'item.resolved'; timestamp: string; itemId: string; before: Verdict; after: Exclude<Verdict, 'pending'>; note: string };
export type RunSnapshot = ReviewRun & { mode: RunMode; status: RunStatus; createdAt: string; audit: AuditEntry[]; error?: string; revisionError?: string; summary: Summary; criteriaFeedback: CriterionFeedback[]; events: ReviewEvent[] };
export type RunEventType = 'run.started' | 'criteria.started' | 'criteria.document.assessed' | 'criteria.ready' | 'criteria.confirmation_required' | 'criteria.confirmed' | 'criteria.revision.started' | 'criteria.revision.completed' | 'criteria.revision.failed' | 'run.awaiting_documents' | 'documents.attached' | 'document.analysis.started' | 'document.analysis.progress' | 'document.analysis.completed' | 'document.analysis.failed' | 'criteria.discovery.progress' | 'document.started' | 'document.extracted' | 'document.reviewing' | 'document.completed' | 'document.incomplete' | 'document.failed' | 'item.decided' | 'item.resolved' | 'run.completed' | 'run.failed' | 'run.cancelled';
export type RunEnvelope = ReviewEvent & { type: RunEventType; mode: RunMode; runStatus: RunStatus; stage: RunStage; criterionVersion: number };
export type ActivityStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'info';
export type ActivityEvent = { id: string; time: string; title: string; step: string; status: ActivityStatus; detail?: string; log?: true; channel?: 'stdout' | 'stderr' | 'status'; handoff?: { fromTaskId: string; toTaskId: string }; attempt?: number; maxAttempts?: number; issueCount?: number; roundStatus?: 'verified' | 'retry' | 'needs_review' };
export type ActivityTask = { id: string; kind: 'document' | 'criteria' | 'dashboard' | 'sandbox'; runtime: 'e2b' | 'gemini'; title: string; documentId?: string; documentName?: string; runId?: string; contextId?: string; parentTaskId?: string; waitingForTaskId?: string; attempt?: number; maxAttempts?: number; status: Exclude<ActivityStatus, 'info'>; phase: string; startedAt: string; updatedAt: string; detail?: string; currentOperation?: { title: string; step: string; startedAt: string; detail?: string }; events: ActivityEvent[]; history: { eventLimit: number; logLimit: number; omittedEvents: number; omittedLogs: number } };
export type ActivitySnapshot = { tasks: ActivityTask[] };
export type GoldenEntry = { id: string; description: string; notice?: string };
export type GoldenCatalog = { criteria: GoldenEntry[]; certificates: GoldenEntry[]; ledgers: GoldenEntry[]; maxCertificates: 10 };
export type GoldenLoadRequest = { mode?: 'all' | 'criteria' | 'target'; criterionId?: string; certificateIds?: string[]; format?: 'pdf' | 'png'; ledgerId?: string | null };
export type GoldenLoadResponse = UploadResponse & { criteriaText: string; scenario: 'golden' };
export type SampleRequest = { kind: 'expenses' | 'materials' };
export type SampleResponse = UploadResponse & { criteriaText: string };
export type LedgerBlockCode = 'headers_not_found' | 'ambiguous_headers' | 'key_not_found' | 'duplicate_key' | 'protected_sheet' | 'formula_key' | 'merged_target' | 'formula_target' | 'aggregate_row';
export type LedgerMapping = { status: 'ready' | 'blocked'; code: LedgerBlockCode | null; reason: string; key: string; sheet: string | null; headerRow?: number; keyColumn: string | null; resultColumn: string | null; noteColumn: string | null; matchingRows: number[]; targetCells: string[]; existingValues: Record<string, string>; sourceDigest?: string; candidates?: { sheet: string; row: number }[] };
export type LedgerProposal = { fingerprint: string; result: '적합' | '부적합' | '확인 필요'; note: string; counts: { total: number; pass: number; fail: number; review: number }; sourceDocumentId: string; sourceDocumentName: string; incomplete: boolean };
export type DocumentStructureAnalysis = PublicAnalysis;
export type LedgerAnalyzeRequest = { documentId: string; key: string; runId?: string; sourceDocumentId?: string; contextId?: string };
export type LedgerAnalyzeResponse = { mapping: LedgerMapping; proposal?: LedgerProposal; analysis?: DocumentStructureAnalysis };
export type LedgerExportRequest = { documentId: string; key: string; runId: string; sourceDocumentId: string; contextId?: string; confirmed: true; mapping: LedgerMapping; proposalFingerprint: string; note?: string };
