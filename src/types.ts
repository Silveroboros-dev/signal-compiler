// types.ts - The only types you need

export interface SignalPack {
  case_id: string;
  processed_at: string;
  signals: Signal[];
  drops: Drop[];
  conflicts: Conflict[];
  next_checks: NextCheck[];
  _cached?: boolean;
}

export interface Signal {
  id: string;
  type: SignalType;
  summary: string;
  severity: Severity;
  owner: string;
  value?: string | number;
  unit?: string;
  evidence: EvidenceSpan[];
  recommended_check: string;
}

export interface EvidenceSpan {
  source: string;        // Which document
  quote: string;         // Exact text from source
  page?: number;         // For scans
}

export interface Drop {
  id: string;
  what: string;          // What we tried to extract
  reason: DropReason;
  detail: string;        // Human explanation
  would_fix: string;     // What input would help
}

export interface Conflict {
  id: string;
  topic: string;         // "cash_position", "shipment_eta"
  claims: ConflictClaim[];
  how_to_resolve: string;
}

export interface ConflictClaim {
  source: string;
  value: string;
  quote: string;
}

export interface NextCheck {
  priority: number;
  owner: string;
  question: string;      // The decisive question
  done_when: string;     // Definition of done
}

export type SignalType =
  | 'liquidity.cash_discrepancy'
  | 'liquidity.covenant_breach'
  | 'liquidity.near_term_outflows'
  | 'quality.nonconformance'
  | 'sales.ar_at_risk'
  | 'ops.inventory_discrepancy'
  | 'ops.receipt_discrepancy'
  | 'logistics.border_delay'
  | 'fx.unhedged_payable';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type DropReason =
  | 'MISSING_EVIDENCE'
  | 'AMBIGUOUS'
  | 'REFERENCED_NOT_ATTACHED';

// Raw response from Gemini (before we add metadata)
export interface GeminiSignalResponse {
  signals: Signal[];
  drops: Drop[];
  conflicts: Conflict[];
  next_checks: NextCheck[];
}
