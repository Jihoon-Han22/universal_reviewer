/** Source-grounded private pipeline contracts; not browser payloads or runtime validators.
 * References are repository-relative. All positions are one-based except explicitly noted.
 * These types describe the frozen implementation, including its documented limitations.
 */
import type { AnalysisQuality, DocumentPreview, Evidence, Item } from './types';

export type DocumentKind = 'pdf' | 'docx' | 'xlsx' | 'csv' | 'txt' | 'md' | 'json' | 'png' | 'jpg' | 'jpeg' | 'webp';
export type DocumentRole = 'target' | 'criteria' | 'ledger';
export type RunDocumentStatus = 'queued' | 'processing' | 'completed' | 'partial' | 'failed' | 'cancelled';
export type DocumentStatus = RunDocumentStatus;
export type RunStage = 'analyzing' | 'criteria' | 'criteria_confirmation' | 'criteria_revising' | 'awaiting_documents' | 'analyzing_targets' | 'extracting' | 'reviewing' | 'complete' | 'failed' | 'cancelled';
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
/** Schema objects are actual JSON Schema supplied by each pipeline call, not parsed output. */
export type JsonSchema = { [keyword: string]: JsonValue };
export type ModelPart = { text: string } | { inlineData: { mimeType: string; data: string } };
export type ModelContent = { role: 'user' | 'model'; parts: ModelPart[] };
/** This is the subset emitted by GSPEC. The SDK accepts additional ContentUnion variants;
 * the adapter itself forwards contents unchanged and does not enforce this subset at runtime. */
export type ModelContents = string | ModelPart[] | ModelContent[];

export type SourceCell = { address: string; text: string; comment?: string; formula?: string; cachedValue?: JsonPrimitive };
export type SourceSheet = {
  name: string; rows: { row: number; cells: SourceCell[] }[];
  state?: string; mergedRanges?: string[]; hiddenRows?: number[];
  hiddenColumns?: { column: string; min: number | null; max: number | null }[];
};
export type SourceRow = { row: number; cells: string[] };
export type VerificationPage = { page: number; text: string };
export type PdfPageImage = { page: number; mimeType: 'image/png'; data: string };
export type ActivityContext = { documentId?: string; documentName?: string; runId?: string; contextId: string; taskId?: string };

/** Python Reader.cell_value: date/time => ISO string; nonfinite float => string;
 * ordinary number/bool preserved, None => null. Formula expression is separate. */
export type ReaderCell = {
  cell: string; column: number; columnName: string; value: JsonPrimitive;
  formula?: string; cachedValue?: JsonPrimitive; cacheMissing?: true;
  comment?: string; hyperlink?: string; numberFormat?: string;
};
export type ReaderRow = { row: number; cells: ReaderCell[] };
export type ReaderSheet = {
  name: string; state: string; maxRow: number; maxColumn: number;
  mergedRanges: string[]; hiddenRows: number[];
  hiddenColumns: { column: string; min: number | null; max: number | null }[];
  rows: ReaderRow[]; complete: boolean;
  autoFilter?: string | null;
  tables?: { name: string; ref: string; headerRowCount: number | null; totalsRowCount: number | null }[];
  headersFooters?: { header: string; footer: string };
  imageInventory?: { index: number; anchor: string; width: number; height: number; format: string | null; path?: string }[];
  chartInventory?: { index: number; type: string }[];
};
export type ReaderCoverage = {
  complete: boolean; unitsTotal: number | null; unitsRead: number;
  cellsTotal: number; cellsRead: number; textChars: number;
  truncated: boolean; truncatedReasons: string[]; missingFormulaCaches?: number; rowsRead?: number;
};
export type ReaderImage = {
  path: string; mime: 'image/png'; width: number; height: number;
  description?: string; sheet?: string; cell?: string; part?: string; page?: number;
  sourceKind?: 'pdf-page'; reason?: 'nonembedded-cjk' | 'scanned'; renderReasons?: ('nonembedded-cjk' | 'scanned')[];
};
export type ReaderPdfTable = {
  bbox: [number, number, number, number]; rowCount: number; columnCount: number;
  header: { names: string[]; external: boolean }; rows: JsonPrimitive[][]; complete: boolean;
};
export type ReaderPdfPage = {
  page: number; width: number; height: number; rotation: number; text: string; complete: boolean;
  blocks: { bbox: [number, number, number, number]; text: string; type: 'text' }[];
  tables: ReaderPdfTable[];
  imageInventory: { xref: number; width: number; height: number; colorSpace: string; name: string }[];
  fontInventory?: { xref: number; extension: string; type: string; baseFont: string; resourceName: string; encoding: string }[];
  fontInspectionFailed?: true; tableDetectionWarning?: string; requiresVisualReading?: true;
  visualRenderingReasons?: ('nonembedded-cjk' | 'scanned')[]; visualPath?: string;
};
export type ReaderWordTable = { rows: string[][]; complete: boolean; nestedTables?: (ReaderWordTable & { row: number; column: number })[] };
export type ReaderWordBlock = { index: number; source: string } & (
  | { kind: 'paragraph'; text: string; style: string | null }
  | ({ kind: 'table' } & ReaderWordTable)
);
/** Fields added by the trusted Python readers. Optional means absent for other formats
 * or because parsing failed before this field was populated, not an arbitrary JSON blob. */
export type ReaderInventory = {
  sourceBytes?: number; bytesRead?: number; sha256?: string;
  archive?: { entries: number; expandedBytes: number; macroParts: number; externalLinkParts: number };
  parserWarningCount?: number; sheetCount?: number;
  sheets?: { name: string; state: string; maxRow: number; maxColumn: number; storedCells: number; mergedRangeCount: number; imageCount: number; chartCount: number; tableNames: string[]; protected: boolean }[];
  definedNames?: { name: string; reference: string }[]; formulaEvaluation?: string;
  pageCount?: number; metadata?: Record<string, string>; embeddedFileCount?: number;
  pages?: { page: number; width: number; height: number; rotation: number }[];
  pagesRequiringVisualRendering?: { page: number; reasons: ('nonembedded-cjk' | 'scanned')[] }[];
  pagesRequiringVisualReading?: number[];
  sectionCount?: number; bodyParagraphCount?: number; bodyTableCount?: number; orderedBlockCount?: number; headerFooterParts?: number;
  properties?: { title: string; subject: string; author: string; keywords: string; comments: string };
  featuresRequiringReview?: Partial<Record<'trackedInsertions' | 'trackedDeletions' | 'contentControls' | 'externalContentChunks' | 'charts' | 'embeddedObjects' | 'equations', number>>;
  images?: { part: string; mime: string; bytes: number }[];
  encoding?: string; delimiter?: string; physicalLines?: number; rowCountAtLeast?: number; rowCount?: number;
  sourceTextChars?: number; jsonRootType?: string; rootKeys?: string[]; rootKeyCount?: number; rootArrayLength?: number;
  width?: number; height?: number; format?: string | null; mode?: string; frameCount?: number; requiresVisualReading?: true;
};
/** server/sandbox-document-reader.py Reader.result; no sparse blank cells invented.
 * CSV does retain blank fields as value:''; XLSX stores nonempty/comment-bearing cells.
 * The reader covers more CLI aliases than uploads; GSPEC upload kind is DocumentKind. */
export type ReaderProfile = {
  kind: DocumentKind; status: 'ready' | 'partial' | 'unsupported'; sha256?: string;
  inventory: ReaderInventory; coverage: ReaderCoverage; warnings: string[]; images: ReaderImage[];
  sheets?: ReaderSheet[]; pages?: ReaderPdfPage[]; blocks?: ReaderWordBlock[];
  sections?: { section: number; pageWidth: number; pageHeight: number; orientation: string }[];
  supplementaryText?: { part: string; text: string }[]; text?: string;
  /** Accepted legacy/test profile field; current CSV reader emits sheets instead. */
  rows?: SourceRow[];
};
export type DocumentStructureRegion = {
  name: string; kind: 'table' | 'text' | 'metadata' | 'image' | 'list' | 'other';
  sheet?: string; page?: number; range?: string; headers: string[]; description: string;
  orientation: 'horizontal' | 'vertical' | 'mixed' | 'unknown'; uncertain: boolean;
};
export type DocumentContext = { summary: string; documentType: string; structure: DocumentStructureRegion[]; warnings: string[]; questions: string[] };
export type VisualCell = { row: number; column: number; rowSpan: number; colSpan: number; text: string; uncertain: boolean; childTableIds?: string[] };
export type VisualTable = { id: string; parentTableId?: string; parentCell?: string; headers?: string[]; cells: VisualCell[] };
export type VisualPage = {
  page: number; rotation: 0 | 90 | 180 | 270; complete: boolean; warnings: string[];
  blocks: { id: string; kind: 'text' | 'table' | 'note'; text: string; uncertain: boolean; tableId?: string }[]; tables: VisualTable[];
};
export type VisualCoverage = { complete: boolean; expectedPages?: number; transcribedPages: number[]; missingPages: number[] };
export type VisualTranscription = {
  pages: VisualPage[]; markdown: string; warnings: string[]; coverage: VisualCoverage; requiresConfirmation: boolean;
  quality?: AnalysisQuality; issueDetails?: { id: string; kind: string; page?: number; detail: string }[];
  verificationLimits?: string[]; activityContext?: ActivityContext;
};
export type AnalysisCoverage = Partial<ReaderCoverage> & {
  complete: boolean; readerComplete: boolean; contextComplete: boolean;
  contextSegmentsTotal?: number; contextSegmentsRead?: number; initialContextSegmentsRead?: number;
  sourceChars?: number; contextChars?: number; sourceTruncated?: boolean; missingContextSheets?: string[];
  visualAnalysisPending?: boolean; transcription?: VisualCoverage;
};
export type PublicAnalysis = {
  status: 'complete' | 'partial' | 'unsupported' | 'failed'; summary: string;
  documentId?: string; name?: string; role?: DocumentRole;
  documentType?: string; structure?: DocumentStructureRegion[]; inventory?: ReaderInventory;
  warnings: string[]; questions?: string[]; needsConfirmation: boolean; coverage: AnalysisCoverage; quality?: AnalysisQuality;
  transcription?: {
    coverage: VisualCoverage; requiresConfirmation: boolean; warnings: string[]; markdown: string; markdownTruncated: boolean;
    pages: { page: number; rotation: 0 | 90 | 180 | 270; complete: boolean; blocks: number; tables: number; warnings: string[] }[];
  };
};
/** profileDocumentSources: preserve original row numbers and A1 addresses; formulas use
 * String(cachedValue) unless cache is null/undefined/'', which yields the exact sentinel
 * '[계산 결과 없음: 수식 재계산 필요]'. Never evaluate formulas. CSV sparse columns are
 * expanded with '' through the maximum retained column, not through sheet.maxColumn.
 * PDF verificationPages contains reader text, not VLM-generated text. */
export type ProfileDocumentSources = { sourceSheets?: SourceSheet[]; sourceRows?: SourceRow[]; verificationPages?: VerificationPage[] };
export type SandboxAnalysisResult = ProfileDocumentSources & {
  analysis: PublicAnalysis; modelParts: ModelPart[]; profile: ReaderProfile;
  activityContext: ActivityContext; pdfPageImages?: PdfPageImage[];
};
/** DocumentStore private object (Buffer is a Uint8Array subclass).
 * Local parsing builds modelParts; authoritative sandbox analysis replaces them. */
export type StoredDocument = ProfileDocumentSources & {
  id: string; name: string; kind: DocumentKind; mime: string; size: number; role: DocumentRole;
  url: string; preview: DocumentPreview; buffer: Uint8Array; modelParts: ModelPart[];
  sandboxAnalysisResult?: AnalyzedDocument; analysisPromise?: Promise<PublicAnalysis>;
};
/** ReviewEngine.analyzeOne strips previousAnalysis/analysisPromise to avoid cache chains,
 * spreads the original document, adds result.profile as sandboxProfile and public analysis.
 * Visual files then add transcription + transcriptionParts to modelParts before caching. */
export type AnalyzedDocument = Omit<StoredDocument, 'sandboxAnalysisResult' | 'analysisPromise'> & {
  sandboxProfile: ReaderProfile; analysis: PublicAnalysis; activityContext: ActivityContext;
  pdfPageImages?: PdfPageImage[]; transcription?: VisualTranscription;
};
/** Local XLSX sheet/cell/text capacity fallback: discards partial sourceSheets.
 * Original buffer remains byte-for-byte; preview is NOT an empty table. */
export type DeferredSpreadsheetParse = {
  source: string; sourceSheets: [];
  preview: { type: 'text'; text: string; truncated: true };
};

/** Separate discovery reader: server/criteria-workbook-profile.py. Values are text,
 * unlike ReaderCell.value. record() caps value/comment4000,formula1000; absent
 * formula cache sets uncachedFormula and the same Korean sentinel in text. */
export type CriteriaWorkbookCell = {
  cell: string; text: string; styleId: number; hiddenRow: boolean; hiddenColumn: boolean;
  mergedRange?: string; formula?: string; uncachedFormula?: boolean; comment?: string; truncated?: true;
};
export type CriteriaWorkbookRegion = {
  /** s{one-based workbook sheet index}-r{one-based retained region index within sheet}. */
  id: string; range: string; nonEmptyCells: number; sample: CriteriaWorkbookCell[]; sampleOnly: boolean;
};
export type CriteriaWorkbookSheet = {
  name: string; visibility: string; dimensions: string; nonEmptyCells: number; profiledCells: number; complete: boolean;
  mergedRanges: string[]; mergedRangesTotal: number; hiddenRows: number[]; hiddenColumns: string[];
  formulas: number; comments: number; images: number; styles: number[];
  regions: CriteriaWorkbookRegion[]; regionsOmitted: number;
};
export type CriteriaWorkbookInventory = {
  sheets: CriteriaWorkbookSheet[]; warnings: string[]; complete: boolean;
  limits: { sheets: 100; profiledCells: 200000; regions: 300 };
};
export type CriteriaReadRange = { sheet: string; range: string };
export type CriteriaDetailRequest = { ranges: CriteriaReadRange[] };
export type CriteriaDetailResponse = {
  ranges: (CriteriaReadRange & { cells: CriteriaWorkbookCell[]; truncated: boolean })[];
  complete: boolean; cellsRead: number;
};
export type WorkbookCellCitation = { sheet: string; cell: string; quote: string };
export type CriteriaRegionClassification = 'criteria' | 'context' | 'unrelated' | 'uncertain';
export type CriteriaDiscoveryPlan = {
  ranges: CriteriaReadRange[]; regions: { id: string; classification: CriteriaRegionClassification; reason: string }[]; warnings: string[];
};
export type CriteriaRegionAssessment = {
  id: string; classification: CriteriaRegionClassification; criterionCells: string[]; reason: string; evidence: WorkbookCellCitation[];
};
export type DocumentRequerySelector =
  | { kind: 'sheet'; sheet: string; range: string }
  | { kind: 'blocks' | 'text'; start: number; end: number };
export type DocumentRequeryRequest = { requests: DocumentRequerySelector[] };
export type DocumentRequeryResponse = {
  sha256: string; kind: DocumentKind;
  coverage: { complete: boolean; requested: number; returned: number; truncated: boolean; cellsRead: number; textChars: number };
  /** source is the bounded serialized selection from trusted Python, not executable code. */
  selections: { request: DocumentRequerySelector; source: string }[]; warnings: string[];
};
/** Synthetic addresses exist ONLY in this internal read-only table view.
 * Word names BLOCKn[/RrCc/Tn]; visual names PAGEp/tableId. They are not XLSX sheets. */
export type InternalStructuredTable = {
  documentId: string; name: string; synthetic?: true; csv?: true;
  page?: number; block?: number; table?: string; parentTable?: string; parentCell?: string;
  rows: { row: number; cells: (SourceCell & { rowSpan?: number; colSpan?: number; uncertain?: true })[] }[];
};
/** nativeCriteriaCitation output, internal provenance; block/table are NOT public Evidence. */
export type InternalNativeCitation =
  | { documentId: string; sheet?: string; cell: string }
  | { documentId: string; page?: number; block?: number; table: string };
/** criteria-notes records removed note text plus native source location; not quote-based Evidence. */
export type IgnoredSourceNote = { text: string; documentId: string; sheet?: string; cell?: string; page?: number; block?: number; table?: string };
export type EligibilityModelEvidence = { documentId: string; quote: string; page?: number; sheet?: string; cell?: string };
export type EligibilityModelResult = {
  status: 'criteria' | 'not_criteria' | 'uncertain'; hasNormativeContent: boolean; reason: string;
  sourceKind?: 'standard' | 'policy' | 'measurement_report' | 'ledger' | 'mixed' | 'other' | 'unknown';
  evidence: EligibilityModelEvidence[];
};
/** Public normalization keeps only documentId/quote/page/sheet/cell; Word evidence
 * is {documentId,quote}; PDF evidence is {documentId,page,quote}. Never promote
 * BLOCK2!A3 or PAGE1/T1 into public sheet/cell. */
export type NormalizedReviewEvidence = Evidence & { quote: string };
export type NormalizedPublicEvidence = NormalizedReviewEvidence;

export type ServiceConfig = Readonly<{ geminiApiKey: string; e2bApiKey: string; modelExtract: string; modelExplore: string; e2bTemplate: string }>;
export type IntegrationService = 'gemini' | 'e2b' | 'config';
export type IntegrationErrorCode = 'CONFIG_MISSING' | 'CONFIG_INVALID' | 'CONFIG_READ' | 'AUTH' | 'QUOTA' | 'MODEL_UNAVAILABLE' | 'TIMEOUT' | 'INVALID_RESPONSE' | 'REQUEST_FAILED' | 'CLEANUP_FAILED';
/** Safe IntegrationError fields; raw cause/request/headers never copied. */
export type IntegrationFailure = { name: 'IntegrationError'; message: string; service: IntegrationService; code: IntegrationErrorCode; status?: number };
export type IntegrationErrorSummary = Pick<IntegrationFailure, 'service' | 'code' | 'status' | 'message'>;
export type ModalityTokenCount = { modality?: 'MODALITY_UNSPECIFIED' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT'; tokenCount?: number };
/** @google/genai2.23.0 usageMetadata is forwarded unchanged, not recalculated. */
export type GeminiUsageMetadata = {
  cacheTokensDetails?: ModalityTokenCount[]; cachedContentTokenCount?: number;
  candidatesTokenCount?: number; candidatesTokensDetails?: ModalityTokenCount[];
  promptTokenCount?: number; promptTokensDetails?: ModalityTokenCount[]; thoughtsTokenCount?: number;
  toolUsePromptTokenCount?: number; toolUsePromptTokensDetails?: ModalityTokenCount[]; totalTokenCount?: number;
  trafficType?: 'TRAFFIC_TYPE_UNSPECIFIED' | 'ON_DEMAND' | 'ON_DEMAND_PRIORITY' | 'ON_DEMAND_FLEX' | 'PROVISIONED_THROUGHPUT';
};
export type GeminiTextRequest = {
  /** At least one truthy contents/prompt required; contents wins via ??, not concatenation. */
  contents?: ModelContents; prompt?: string; role?: 'extract' | 'explore';
  schema?: JsonSchema; systemInstruction?: string; maxOutputTokens?: number; signal?: AbortSignal;
};
export type GeminiJsonRequest<T> = GeminiTextRequest & { schema: JsonSchema; validate?: (data: T) => boolean };
export type GeminiTextResponse = { text: string; model: string | undefined; usage: GeminiUsageMetadata | undefined };
export type GeminiJsonResponse<T> = { data: T; model: string | undefined; usage: GeminiUsageMetadata | undefined };
export type GeminiStreamEvent = { type: 'text.delta'; text: string } | { type: 'usage'; usage: GeminiUsageMetadata } | { type: 'done' };
export type GeminiAdapter = {
  generateText(options: GeminiTextRequest): Promise<GeminiTextResponse>;
  generateJson<T>(options: GeminiJsonRequest<T>): Promise<GeminiJsonResponse<T>>;
  streamText(options: GeminiTextRequest): AsyncGenerator<GeminiStreamEvent, void, void>;
};
/** Exact fake SDK boundary used by createGemini({client}), not provider HTTP JSON.
 * Role defaults extract; token default2048 and integer1..32768; schema sets both
 * JSON responseMimeType/responseJsonSchema. Blank response.text ->INVALID_RESPONSE.
 * generateJson does JSON.parse then optional validate; schema alone is not a local
 * semantic validator. No adapter response-byte, text-char, part-count or inline-byte
 * cap exists; stage-level caps are separate. No adapter retry loop exists. SDK
 * errors map via safeError; AbortError is TIMEOUT at this boundary. */
export type GeminiSdkRequest = {
  model: string; contents: ModelContents;
  config: { maxOutputTokens: number; systemInstruction?: string; abortSignal?: AbortSignal; responseMimeType?: 'application/json'; responseJsonSchema?: JsonSchema };
};
export type GeminiSdkResponse = { text?: string; modelVersion?: string; usageMetadata?: GeminiUsageMetadata };
export type GeminiFakeClient = { models: {
  generateContent(args: GeminiSdkRequest): Promise<GeminiSdkResponse>;
  generateContentStream(args: GeminiSdkRequest): Promise<AsyncIterable<GeminiSdkResponse>>;
} };
export type SandboxCommandResult = { exitCode: number; stdout: string; stderr: string; error?: string };
export type SandboxCommandOptions = { timeoutMs: number; requestTimeoutMs: number; onStdout?: (text: string) => void; onStderr?: (text: string) => void };
export type SandboxWriteInfo = { name: string; path: string; type?: 'file' | 'dir' | 'symlink'; metadata?: Record<string, string> };
/** Minimal consumed E2B2.51 interface; reads may request a binary representation. */
export type SandboxHandle = {
  commands: { run(command: string, options: SandboxCommandOptions): Promise<SandboxCommandResult> };
  files: {
    write(path: string, data: string | ArrayBuffer | Blob | ReadableStream): Promise<SandboxWriteInfo>;
    write(files: { path: string; data: string | ArrayBuffer | Blob | ReadableStream }[]): Promise<SandboxWriteInfo[]>;
    read(path: string): Promise<string>;
    read(path: string, options: { format: 'bytes' }): Promise<Uint8Array>;
  };
  kill(options: { requestTimeoutMs: number }): Promise<boolean>;
};
/** Lifecycle work result is generic; E2B cleanup failure rejects even if work succeeded.
 * withSandbox timeout default60000, accepted10000..300000; create request30000,
 * kill15000; same kill promise on abort/finally. Global2 slots held through cleanup. */
export type SandboxActivityInput = {
  kind?: 'document' | 'criteria' | 'dashboard' | 'sandbox'; title?: string;
  documentId?: string; documentName?: string; runId?: string; contextId?: string; parentTaskId?: string; attempt?: number; maxAttempts?: number;
};
export type ServiceActivityEvent = {
  step?: string; phase?: string; title?: string; status?: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'info';
  detail?: string; log?: boolean; channel?: 'stdout' | 'stderr' | 'status'; attempt?: number; maxAttempts?: number;
  issueCount?: number; roundStatus?: 'verified' | 'retry' | 'needs_review'; handoff?: { fromTaskId: string; toTaskId: string };
};
export type SandboxReporter = ((event: ServiceActivityEvent) => void) & { taskId?: string };
export type SandboxFactory = { create(template: string, options: { apiKey: string; timeoutMs: number; requestTimeoutMs: 30000 }): Promise<SandboxHandle> };
export type SandboxRunner = <T>(work: (sandbox: SandboxHandle, report: SandboxReporter) => T | Promise<T>, options?: {
  config?: ServiceConfig; timeoutMs?: number; sandboxFactory?: SandboxFactory; signal?: AbortSignal; activity?: SandboxActivityInput;
}) => Promise<T>;

/** CURRENT dashboard snapshotRun projection, not a full Item. null/undefined value
 * becomes ''; status pending/unknown becomes review. presence, missingVerified,
 * machineStatus and evidence.blank are dropped by the current allowlist. The optional
 * future DB-H01 types below are separate and MUST NOT be added to CURRENT_REPRODUCTION. */
export type DashboardSnapshotCitation = { documentId: string; page?: number; sheet?: string; cell?: string; quote?: string };
export type DashboardSnapshotItem = {
  id: string; documentId: string; documentName: string; label: string; value: string; unit: string;
  criterionId: string; criterion: string; status: 'pass' | 'fail' | 'review'; explanation: string;
  reviewedByHuman: boolean; humanNote: string; sourceEvidence: DashboardSnapshotCitation[];
  evidence: { page: number | null; sheet: string; cell: string; quote: string };
};
export type DashboardSourceItem = Omit<DashboardSnapshotItem, 'documentName' | 'sourceEvidence' | 'evidence'> & { evidence: DashboardSnapshotCitation[] };
/** Deliberately distinct from DashboardSourceItem, which is lossy. */
export type FullReviewItem = Item;
export type DashboardReviewSnapshot = {
  runId: string; createdAt: string; criterionVersion: number; partial: boolean;
  summary: { total: number; pass: number; fail: number; review: number; humanReviewed: number; documents: number };
  documents: { id: string; name: string }[]; items: DashboardSnapshotItem[];
  numericGroups: { label: string; unit: string; criterion: string; total: number; values: { id: string; documentId: string; documentName: string; value: number }[] }[];
};

/** OPTIONAL_FUTURE DB-H01 DTO (specs/05), excluded from CURRENT_REPRODUCTION.
 * Legacy RequiredRebuild* names are retained solely for historical cross references;
 * they do not make this profile mandatory or extend any current HTTP payload.
 * Own-property absence stays absent and false stays false. Capture once in immutable
 * snapshot and project its fields to sourceItems; do not merge later live run state.
 * 'unknown' is retained because it is an actual normalized Item value. No extra wire tag.
 * DB-H01 does not add machineStatus/evidence.blank to the existing dashboard allowlist. */
export type RequiredRebuildDashboardSnapshotItem = DashboardSnapshotItem & {
  presence?: 'present' | 'missing' | 'unreadable' | 'unknown'; missingVerified?: boolean;
};
export type RequiredRebuildDashboardSourceItem = DashboardSourceItem & {
  presence?: 'present' | 'missing' | 'unreadable' | 'unknown'; missingVerified?: boolean;
};
export type RequiredRebuildDashboardReviewSnapshot = Omit<DashboardReviewSnapshot, 'items'> & {
  items: RequiredRebuildDashboardSnapshotItem[];
};

/** OPTIONAL_FUTURE D05a/b only; current jobs/plans have no notices contract.
 * Runtime validators require 0..5 unique codes in this exact order. Render host-fixed
 * messages only, never model free text. Preserve [] as no notices. The first two codes
 * require host-verified capability limitations; the last two are host-authored outcomes.
 * These are presentation metadata, never edits to the frozen review snapshot or subtitle. */
export type RequiredRebuildDashboardNoticeCode =
  | 'UNSUPPORTED_TREND'
  | 'UNSUPPORTED_VISUALIZATION'
  | 'SHARED_ACCENT_SCOPE'
  | 'CUSTOMIZATION_NOT_APPLIED'
  | 'CUSTOMIZATION_PARTIAL';
/** Optional-future extension on BOTH planner and semantic-judge envelopes. */
export type RequiredRebuildDashboardNoticeMetadata = { notices: RequiredRebuildDashboardNoticeCode[] };
/** Intersect with the public ready-job DTO; no new API discriminator is introduced. */
export type RequiredRebuildDashboardPublicReadyJobExtension = RequiredRebuildDashboardNoticeMetadata & { status: 'ready' };
/** The same codes are serialized into standalone HTML presentation metadata. */
export type RequiredRebuildDashboardStandaloneMetadataExtension = RequiredRebuildDashboardNoticeMetadata;
