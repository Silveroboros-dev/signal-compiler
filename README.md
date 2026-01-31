# Signal Compiler

Executive Agent Harness for extracting evidence-backed signals from messy executive documents.

Built for the Gemini 3 Hackathon.

## What It Does

Executives don't lack information—they lack reliable telemetry. Signal Compiler:

- Extracts **evidence-backed signals** from PDFs (typed, with severity and owner)
- Surfaces **conflicts** when sources disagree (with canonical taxonomy)
- Explains **drops** when evidence is referenced but not attached
- Generates **next checks** (template-based, not case-specific)

## Quick Start

```bash
# Install dependencies
npm install

# Set your Gemini API key
export GEMINI_API_KEY=your_key_here

# Run the server
npm run dev
```

Open http://localhost:3000, select a pack, and click "Compile Signals".

## Adding Your Own Document Packs

1. Create a folder for your documents (e.g., `my-pack/`)
2. Add your PDFs to the folder
3. Edit `packs.json` to add your pack:

```json
{
  "packs": [
    {
      "id": "my_custom_pack",
      "name": "My Custom Pack",
      "description": "Description of what this pack contains",
      "files": [
        { "doc_id": "weekly-report", "filename": "my-pack/weekly-report.pdf" },
        { "doc_id": "email-thread", "filename": "my-pack/emails.pdf" },
        { "doc_id": "financials", "filename": "my-pack/financials-scan.pdf" }
      ]
    }
  ]
}
```

4. Restart the server—your pack will appear in the dropdown.

### File Path Rules

- Paths are relative to the project root
- Use forward slashes (`/`) even on Windows
- `doc_id` is a short identifier used in evidence references

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/packs` | GET | List available packs |
| `/compile/:packId` | POST | Compile signals from a pack |
| `/export/:packId` | GET | Download run as JSON |
| `/export/:packId/md` | GET | Download run as Markdown |
| `/health` | GET | Health check |

## Output Schema

Each run produces a `run.json` with:

```json
{
  "run_meta": { "run_id", "pack_id", "model", "config_hash", "created_at" },
  "inputs": [{ "doc_id", "filename", "sha256", "type" }],
  "signals": [{ "id", "type", "severity", "severity_reason", "owner", "summary", "evidence", "blocker_for" }],
  "conflicts": [{ "id", "type", "topic", "claims", "flags", "how_to_resolve" }],
  "drops": [{ "id", "what", "reason", "detail", "would_fix" }],
  "next_checks": [{ "priority", "owner", "template", "question", "done_when", "slots" }],
  "evidence": [{ "id", "doc_id", "page", "bbox", "line", "quote" }]
}
```

## Signal Types

- `liquidity.cash_discrepancy` - Cash values differ across sources
- `liquidity.covenant_breach` - Covenant threshold at risk
- `liquidity.near_term_outflows` - Large payments due soon
- `quality.nonconformance` - Product fails specification
- `sales.ar_at_risk` - Customer withholding payment
- `ops.inventory_discrepancy` - Inventory counts don't match
- `ops.receipt_discrepancy` - Received quantity differs
- `logistics.border_delay` - Shipment held at border
- `fx.unhedged_payable` - Large FX exposure without hedge

## Conflict Taxonomy

- `liquidity.cash_definition` - Cash with different/unclear definitions
- `liquidity.cash_amount` - Same definition, different amounts
- `logistics.eta` - Delivery time discrepancies
- `logistics.quantity` - Shipped vs received quantities
- `quality.conformance` - Pass vs fail on same spec
- `sales.payment_terms` - Disputed payment terms
- `ops.inventory_count` - Inventory count discrepancies

## Severity Rules

| Signal Type | CRITICAL | HIGH | MEDIUM | LOW |
|-------------|----------|------|--------|-----|
| covenant_breach | Breach possible | >80% threshold | >60% threshold | <60% |
| cash_discrepancy | N/A | >5% or >$10k | 2-5% or $5-10k | <2% and <$5k |
| nonconformance | Safety-related | Customer-facing | Internal-only | Documentation |
| inventory_discrepancy | N/A | >2% or >$5k | 1-2% | <1% |
| border_delay | Production stops | >24h + impact | >24h, no impact | <24h |

## Project Structure

```
signal-compiler/
├── src/
│   ├── main.ts      # Express server + Gemini integration
│   ├── prompt.ts    # The prompt that drives signal extraction
│   └── types.ts     # TypeScript interfaces
├── public/
│   └── index.html   # UI
├── packs.json       # Document pack definitions
├── demo-artifacts/  # Sample PDFs (AgriNova W04)
└── runs/            # Saved run outputs
```

## License

MIT
