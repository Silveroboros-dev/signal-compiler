// main.ts - Express server + Gemini call

import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFileSync, existsSync, writeFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { createHash } from 'crypto';
import { SIGNAL_COMPILER_PROMPT } from './prompt';
import { SignalPack, GeminiSignalResponse, Drop } from './types';

const app = express();

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Serve static files
app.use(express.static(join(__dirname, '..', 'public')));
app.use(express.json());

// Pack configurations
interface PackConfig {
  id: string;
  name: string;
  files: { doc_id: string; filename: string }[];
}

const PACKS: Record<string, PackConfig> = {
  'agrinova_w04': {
    id: 'agrinova_w04',
    name: 'AgriNova W04 2026 (Original)',
    files: [
      { doc_id: 'weekly-pack', filename: 'Demo_Artifact_1_Weekly_Pack_AgriNova_W04_2026.pdf' },
      { doc_id: 'email-thread', filename: 'Demo_Artifact_2_Email_Thread_AgriNova_Covenant_Quality_Dispute.pdf' },
      { doc_id: 'meeting-notes', filename: 'Demo_Artifact_3_Meeting_Notes_AgriNova_Cash_Risk_2026-01-26.pdf' },
      { doc_id: 'qa-report-scan', filename: 'Demo_Artifact_4_QA_Lab_Report_Scan.pdf' },
      { doc_id: 'bank-statement-scan', filename: 'Demo_Artifact_5_Bank_Statement_Scan.pdf' },
    ]
  },
  'nordlake_compliance_w07': {
    id: 'nordlake_compliance_w07',
    name: 'Nordlake Bank Compliance W07 2026',
    files: [
      { doc_id: 'weekly-dashboard', filename: 'Pack1_Compliance_W07_2026_NordlakeBank_Weekly_Compliance_Dashboard.pdf' },
      { doc_id: 'email-thread', filename: 'Pack1_Compliance_W07_2026_NordlakeBank_Email_Thread_KYC_Sanctions.pdf' },
      { doc_id: 'meeting-notes', filename: 'Pack1_Compliance_W07_2026_NordlakeBank_Meeting_Notes_Compliance_Committee.pdf' },
      { doc_id: 'sanctions-scan', filename: 'Pack1_Compliance_W07_2026_NordlakeBank_Sanctions_Screening_Scan.pdf' },
    ]
  },
  'agrinova_cyber_incident': {
    id: 'agrinova_cyber_incident',
    name: 'AgriNova Cyber Incident 2026-02-11',
    files: [
      { doc_id: 'incident-summary', filename: 'Pack2_CyberIncident_2026-02-11_AgriNova_Incident_Summary.pdf' },
      { doc_id: 'slack-thread', filename: 'Pack2_CyberIncident_2026-02-11_AgriNova_Slack_Thread_Export.pdf' },
      { doc_id: 'postmortem-notes', filename: 'Pack2_CyberIncident_2026-02-11_AgriNova_Postmortem_Notes.pdf' },
      { doc_id: 'edr-alert-scan', filename: 'Pack2_CyberIncident_2026-02-11_AgriNova_EDR_Alert_Scan.pdf' },
    ]
  },
  'solaris_procurement_w12': {
    id: 'solaris_procurement_w12',
    name: 'Solaris Manufacturing Procurement W12 2026',
    files: [
      { doc_id: 'weekly-pack', filename: 'Pack3_Procurement_W12_2026_SolarisMfg_Weekly_Procurement_Pack.pdf' },
      { doc_id: 'email-thread', filename: 'Pack3_Procurement_W12_2026_SolarisMfg_Email_Thread_Price_Escalation.pdf' },
      { doc_id: 'meeting-notes', filename: 'Pack3_Procurement_W12_2026_SolarisMfg_Meeting_Notes_Supplier_Negotiation.pdf' },
      { doc_id: 'invoice-scan', filename: 'Pack3_Procurement_W12_2026_SolarisMfg_Proforma_Invoice_Scan.pdf' },
    ]
  }
};

// Run Evidence Pack schema
interface RunEvidencePack {
  run_meta: {
    run_id: string;
    pack_id: string;
    model: string;
    config_hash: string;
    created_at: string;
  };
  inputs: {
    doc_id: string;
    filename: string;
    sha256: string;
    type: string;
    page_count?: number;
  }[];
  signals: any[];
  conflicts: any[];
  drops: any[];
  next_checks: any[];
  evidence: {
    id: string;
    doc_id: string;
    page?: number;
    bbox?: number[];
    line?: number;
    quote: string;
  }[];
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// List available packs
app.get('/packs', (req, res) => {
  const packList = Object.entries(PACKS).map(([key, pack]) => ({
    id: key,
    name: pack.name,
    file_count: pack.files.length
  }));
  res.json(packList);
});

// Compile a specific pack
app.post('/compile/:packId?', async (req, res) => {
  const packId = req.params.packId || 'agrinova_w04';
  const pack = PACKS[packId];

  if (!pack) {
    return res.status(400).json({ error: 'Unknown pack', available: Object.keys(PACKS) });
  }

  console.log(`[compile] Starting compilation for pack: ${pack.name}`);
  const startTime = Date.now();

  try {
    const result = await compileSignals(pack);
    const duration = Date.now() - startTime;
    console.log(`[compile] Completed in ${duration}ms - ${result.signals.length} signals, ${result.conflicts.length} conflicts, ${result.drops.length} drops`);
    res.json(result);
  } catch (error) {
    console.error('[compile] Failed:', error);
    res.status(500).json({
      error: 'Compilation failed',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

// Export run as JSON (new format)
app.get('/export/:packId', async (req, res) => {
  const packId = req.params.packId || 'agrinova_w04';
  const pack = PACKS[packId];

  if (!pack) {
    return res.status(400).json({ error: 'Unknown pack' });
  }

  // Check for cached result
  const cachedPath = join(__dirname, '..', `runs/${packId}_latest.json`);
  if (existsSync(cachedPath)) {
    const cached = JSON.parse(readFileSync(cachedPath, 'utf-8'));
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${packId}_run.json"`);
    return res.json(cached);
  }

  res.status(404).json({ error: 'No run found for this pack. Run /compile first.' });
});

// Export run as Markdown
app.get('/export/:packId/md', async (req, res) => {
  const packId = req.params.packId || 'agrinova_w04';
  const cachedPath = join(__dirname, '..', `runs/${packId}_latest.json`);

  if (!existsSync(cachedPath)) {
    return res.status(404).json({ error: 'No run found. Run /compile first.' });
  }

  const run: RunEvidencePack = JSON.parse(readFileSync(cachedPath, 'utf-8'));
  const md = generateMarkdown(run);

  res.setHeader('Content-Type', 'text/markdown');
  res.setHeader('Content-Disposition', `attachment; filename="${packId}_run.md"`);
  res.send(md);
});

function generateMarkdown(run: RunEvidencePack): string {
  const criticalCount = run.signals.filter((s: any) => s.severity === 'critical').length;
  const highCount = run.signals.filter((s: any) => s.severity === 'high').length;

  let md = `# Run Report: ${run.run_meta.pack_id}\n\n`;
  md += `**Generated:** ${run.run_meta.created_at}\n`;
  md += `**Model:** ${run.run_meta.model}\n\n`;

  md += `## Summary\n\n`;
  md += `| Metric | Count |\n|--------|-------|\n`;
  md += `| Critical Signals | ${criticalCount} |\n`;
  md += `| High Signals | ${highCount} |\n`;
  md += `| Total Signals | ${run.signals.length} |\n`;
  md += `| Conflicts | ${run.conflicts.length} |\n`;
  md += `| Drops | ${run.drops.length} |\n`;
  md += `| Next Checks | ${run.next_checks.length} |\n\n`;

  md += `## Inputs\n\n`;
  for (const input of run.inputs) {
    md += `- **${input.doc_id}**: ${input.filename} (${input.type})\n`;
  }
  md += `\n`;

  md += `## Signals\n\n`;
  for (const sig of run.signals) {
    md += `### ${sig.id}: ${sig.type}\n`;
    md += `**Severity:** ${sig.severity} | **Owner:** ${sig.owner}\n\n`;
    md += `> ${sig.summary}\n\n`;
    if (sig.severity_reason) {
      md += `*Severity reason:* ${sig.severity_reason}\n\n`;
    }
    if (sig.evidence && sig.evidence.length > 0) {
      md += `**Evidence:**\n`;
      for (const ev of sig.evidence) {
        md += `- ${ev.source} p.${ev.page || '?'}: "${ev.quote}"\n`;
      }
    }
    md += `\n`;
  }

  md += `## Conflicts\n\n`;
  for (const conf of run.conflicts) {
    md += `### ${conf.id}: ${conf.type || conf.topic}\n`;
    if (conf.flags && conf.flags.length) {
      md += `**Flags:** ${conf.flags.join(', ')}\n\n`;
    }
    md += `**Claims:**\n`;
    for (const claim of conf.claims || conf.contenders || []) {
      md += `- ${claim.source}: ${claim.value} (${claim.definition || 'unknown'}, ${claim.value_date || 'no date'})\n`;
    }
    md += `\n**Resolution:** ${conf.how_to_resolve || conf.resolution}\n\n`;
  }

  md += `## Drops\n\n`;
  for (const drop of run.drops) {
    md += `- **${drop.id}** (${drop.reason}): ${drop.what}\n`;
    md += `  - Would fix: ${drop.would_fix}\n`;
  }
  md += `\n`;

  md += `## Next Checks\n\n`;
  for (const check of run.next_checks) {
    md += `### ${check.priority}. ${check.template || 'check'}\n`;
    md += `**Owner:** ${check.owner}\n\n`;
    md += `> ${check.question}\n\n`;
    md += `**Done when:** ${check.done_when}\n`;
    if (check.slots) {
      md += `\n**Slots:** \`${JSON.stringify(check.slots)}\`\n`;
    }
    md += `\n`;
  }

  return md;
}

async function compileSignals(packConfig: PackConfig): Promise<SignalPack> {
  const cachedPath = join(__dirname, '..', `runs/${packConfig.id}_latest.json`);
  const TIMEOUT_MS = 90000; // 90 seconds for larger packs

  try {
    const result = await Promise.race([
      liveCompile(packConfig),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini timeout')), TIMEOUT_MS)
      )
    ]);

    // Save as run evidence pack
    try {
      const fs = await import('fs');
      const runsDir = join(__dirname, '..', 'runs');
      if (!existsSync(runsDir)) {
        fs.mkdirSync(runsDir, { recursive: true });
      }
      fs.writeFileSync(cachedPath, JSON.stringify(result._runPack, null, 2));
      console.log(`[compile] Run saved to ${cachedPath}`);
    } catch (e) {
      console.warn('[compile] Failed to save run:', e);
    }

    return result;
  } catch (error) {
    console.warn('[compile] Live compilation failed, checking cache...', error);

    if (existsSync(cachedPath)) {
      console.log('[compile] Using cached result');
      const cached = JSON.parse(readFileSync(cachedPath, 'utf-8'));
      return {
        case_id: packConfig.id,
        processed_at: cached.run_meta?.created_at || new Date().toISOString(),
        signals: cached.signals || [],
        conflicts: cached.conflicts || [],
        drops: cached.drops || [],
        next_checks: cached.next_checks || [],
        _cached: true
      };
    }

    throw error;
  }
}

async function liveCompile(packConfig: PackConfig): Promise<SignalPack & { _runPack: RunEvidencePack }> {
  const projectRoot = join(__dirname, '..');
  const artifactsDir = join(projectRoot, 'demo-artifacts');

  // Build inputs metadata
  const inputs: RunEvidencePack['inputs'] = [];
  const parts: any[] = [{ text: SIGNAL_COMPILER_PROMPT }];

  for (const file of packConfig.files) {
    // Try multiple locations
    let filePath = join(projectRoot, file.filename);
    if (!existsSync(filePath)) {
      filePath = join(artifactsDir, file.filename);
    }

    if (!existsSync(filePath)) {
      console.warn(`[compile] File not found: ${file.filename}`);
      continue;
    }

    console.log(`[compile] Loading: ${file.doc_id}`);
    const data = readFileSync(filePath);
    const sha256 = createHash('sha256').update(data).digest('hex');

    inputs.push({
      doc_id: file.doc_id,
      filename: file.filename,
      sha256,
      type: 'pdf'
    });

    parts.push({ text: `\n\n--- Document: ${file.doc_id} (${file.filename}) ---\n` });
    parts.push({
      inlineData: {
        mimeType: 'application/pdf',
        data: data.toString('base64'),
      },
    });
  }

  if (parts.length < 3) {
    throw new Error('No artifacts found for this pack.');
  }

  console.log(`[compile] Sending ${parts.length} parts to Gemini...`);

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',  // Use stable model
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  });

  const result = await model.generateContent(parts);
  const response = result.response;
  const text = response.text();

  console.log(`[compile] Received response (${text.length} chars)`);

  let parsed: GeminiSignalResponse;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    console.error('[compile] Failed to parse Gemini response:', text.slice(0, 500));
    throw new Error('Invalid JSON from Gemini');
  }

  const verified = verifyEvidence(parsed);
  const now = new Date().toISOString();

  // Build run evidence pack
  const runPack: RunEvidencePack = {
    run_meta: {
      run_id: `${now}_${packConfig.id}`,
      pack_id: packConfig.id,
      model: 'gemini-2.5-flash',
      config_hash: createHash('md5').update(SIGNAL_COMPILER_PROMPT).digest('hex').slice(0, 8),
      created_at: now
    },
    inputs,
    signals: verified.signals,
    conflicts: verified.conflicts,
    drops: verified.drops,
    next_checks: verified.next_checks,
    evidence: extractEvidenceSpans(verified)
  };

  return {
    case_id: packConfig.id,
    processed_at: now,
    ...verified,
    _runPack: runPack
  };
}

function extractEvidenceSpans(pack: Omit<SignalPack, 'case_id' | 'processed_at' | '_cached'>): RunEvidencePack['evidence'] {
  const evidence: RunEvidencePack['evidence'] = [];
  let evId = 1;

  for (const sig of pack.signals) {
    if (sig.evidence) {
      for (const ev of sig.evidence) {
        evidence.push({
          id: `ev_${evId++}`,
          doc_id: ev.source.replace('.pdf', ''),
          page: ev.page,
          bbox: ev.bbox,
          line: ev.line,
          quote: ev.quote
        });
      }
    }
  }

  for (const conf of pack.conflicts) {
    if (conf.claims) {
      for (const claim of conf.claims) {
        if (claim.quote) {
          evidence.push({
            id: `ev_${evId++}`,
            doc_id: claim.source?.replace('.pdf', '') || 'unknown',
            page: claim.page,
            quote: claim.quote
          });
        }
      }
    }
  }

  return evidence;
}

function verifyEvidence(pack: GeminiSignalResponse): Omit<SignalPack, 'case_id' | 'processed_at' | '_cached'> {
  const signals = pack.signals || [];
  const drops: Drop[] = pack.drops || [];
  const conflicts = pack.conflicts || [];
  const next_checks = pack.next_checks || [];

  const validSignals = [];
  for (const signal of signals) {
    if (!signal.evidence || signal.evidence.length === 0) {
      console.warn(`[verify] Signal ${signal.id} has no evidence - moving to drops`);
      drops.push({
        id: `D_${signal.id}`,
        what: signal.summary,
        reason: 'MISSING_EVIDENCE',
        detail: 'Signal extracted but no evidence quote provided',
        would_fix: 'Manual review required',
      });
    } else {
      validSignals.push(signal);
    }
  }

  console.log(`[verify] ${validSignals.length} signals verified, ${drops.length} drops, ${conflicts.length} conflicts`);

  return {
    signals: validSignals,
    drops,
    conflicts,
    next_checks,
  };
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  Signal Compiler - Executive Agent Harness                 ║
║  Running at http://localhost:${PORT}                           ║
║                                                            ║
║  GET  /packs              - List available packs           ║
║  POST /compile/:packId    - Compile signals from pack      ║
║  GET  /export/:packId     - Export run as JSON             ║
║  GET  /export/:packId/md  - Export run as Markdown         ║
║  GET  /health             - Health check                   ║
╚════════════════════════════════════════════════════════════╝
  `);

  console.log('Available packs:');
  for (const [id, pack] of Object.entries(PACKS)) {
    console.log(`  - ${id}: ${pack.name} (${pack.files.length} files)`);
  }

  if (!process.env.GEMINI_API_KEY) {
    console.warn('\n⚠️  GEMINI_API_KEY not set. Set it with: export GEMINI_API_KEY=your_key');
  }
});
