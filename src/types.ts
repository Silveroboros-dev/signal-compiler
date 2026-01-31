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
  severity_reason?: string;   // Rule-based justification for severity
  owner: string;
  value?: string | number;
  unit?: string;
  evidence: EvidenceSpan[];
  recommended_check: string;
  blocker_for?: string[];     // IDs of signals this blocks
}

export interface EvidenceSpan {
  source: string;        // Which document
  quote: string;         // Exact text from source
  page?: number;         // Page number (1-indexed)
  line?: number;         // Line number for text docs
  bbox?: [number, number, number, number];  // [x, y, width, height] for scans (0-1 normalized)
}

// For money-like claims, track exactly what the number means
export interface MoneyValue {
  amount: number;
  currency: string;
  definition: CashDefinition;
  value_date: string;    // ISO date when this value was recorded
}

// Cash definitions - 'unknown' for unclassified internal figures
export type CashDefinition = 'ledger' | 'available' | 'restricted' | 'unrestricted' | 'internal_reported' | 'unknown';

export interface Drop {
  id: string;
  what: string;          // What we tried to extract
  reason: DropReason;
  detail: string;        // Human explanation
  would_fix: string;     // What input would help
}

export interface Conflict {
  id: string;
  type: ConflictType;    // Canonical taxonomy
  topic: string;         // Human-readable topic for UI
  claims: ConflictClaim[];
  how_to_resolve: string;
  flags?: ConflictFlag[];
}

// Canonical conflict taxonomy - stable across cases
export type ConflictType =
  | 'liquidity.cash_definition'    // Cash values with different/unclear definitions
  | 'liquidity.cash_amount'        // Same definition, different amounts
  | 'logistics.eta'                // Delivery/clearance time discrepancies
  | 'logistics.quantity'           // Shipped vs received quantities
  | 'quality.conformance'          // Pass vs fail on same spec
  | 'sales.payment_terms'          // Disputed payment terms
  | 'ops.inventory_count';         // Inventory count discrepancies

export type ConflictFlag =
  | 'VALUE_DATE_MISMATCH'    // Claims have different as-of dates
  | 'DEFINITION_UNKNOWN'     // One or more claims has unknown definition
  | 'BLOCKER';               // This conflict blocks downstream calculations

export interface ConflictClaim {
  source: string;
  value: string;
  quote: string;
  page?: number;
  definition?: string;   // For money: ledger/available/restricted/unrestricted
  value_date?: string;   // ISO date for time-sensitive values
}

// Template-based next checks - generalizable, not case-specific
export interface NextCheck {
  priority: number;
  owner: string;
  template: NextCheckTemplate;   // Canonical template ID
  question: string;              // Rendered question (filled from template)
  done_when: string;             // Definition of done
  slots?: Record<string, string | number>;  // Case-specific values that fill the template
}

// Canonical next-check templates
export type NextCheckTemplate =
  | 'cash_reconciliation'        // Reconcile internal vs bank, enumerate restricted items
  | 'covenant_threshold_check'   // Verify metric >= threshold per covenant definition
  | 'eta_confirmation'           // Confirm delivery/clearance ETA with authoritative source
  | 'quantity_verification'      // Verify quantity with source documents
  | 'quality_retest'             // Retest product against spec
  | 'payment_status'             // Confirm payment status with customer/bank
  | 'restricted_classification'; // Determine if restricted items count toward covenant metric

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

// Severity calibration rules
export const SEVERITY_RULES: Record<string, { threshold: string; rule: string }> = {
  'liquidity.covenant_breach': {
    threshold: 'Any',
    rule: 'CRITICAL if covenant breach is possible; HIGH if >80% of threshold consumed'
  },
  'liquidity.cash_discrepancy': {
    threshold: '>5% or >$10,000',
    rule: 'HIGH if discrepancy >5% of reported value or >$10,000; MEDIUM otherwise'
  },
  'quality.nonconformance': {
    threshold: 'Any spec failure',
    rule: 'CRITICAL if safety-related; HIGH if customer-facing; MEDIUM if internal-only'
  },
  'ops.inventory_discrepancy': {
    threshold: '>2% or >$5,000',
    rule: 'HIGH if >2% variance or >$5,000; MEDIUM if 1-2%; LOW if <1%'
  },
  'logistics.border_delay': {
    threshold: '>24h delay',
    rule: 'HIGH if delay >24h and affects production; MEDIUM if >24h without production impact; LOW if <24h'
  }
};

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
