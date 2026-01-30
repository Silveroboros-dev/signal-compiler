// main.ts - Express server + Gemini call

import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { SIGNAL_COMPILER_PROMPT } from './prompt';
import { SignalPack, GeminiSignalResponse, Drop } from './types';

const app = express();

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Serve static files
app.use(express.static(join(__dirname, '..', 'public')));
app.use(express.json());

// Demo artifacts configuration
const DEMO_ARTIFACTS = [
  { name: 'weekly-pack.pdf', file: 'Demo_Artifact_1_Weekly_Pack_AgriNova_W04_2026.pdf' },
  { name: 'email-thread.pdf', file: 'Demo_Artifact_2_Email_Thread_AgriNova_Covenant_Quality_Dispute.pdf' },
  { name: 'meeting-notes.pdf', file: 'Demo_Artifact_3_Meeting_Notes_AgriNova_Cash_Risk_2026-01-26.pdf' },
  { name: 'qa-report-scan.pdf', file: 'Demo_Artifact_4_QA_Lab_Report_Scan.pdf' },
  { name: 'bank-statement-scan.pdf', file: 'Demo_Artifact_5_Bank_Statement_Scan.pdf' },
];

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// The one endpoint that matters
app.post('/compile', async (req, res) => {
  console.log('[compile] Starting signal compilation...');
  const startTime = Date.now();

  try {
    const pack = await compileSignals();
    const duration = Date.now() - startTime;
    console.log(`[compile] Completed in ${duration}ms - ${pack.signals.length} signals, ${pack.conflicts.length} conflicts, ${pack.drops.length} drops`);
    res.json(pack);
  } catch (error) {
    console.error('[compile] Failed:', error);
    res.status(500).json({
      error: 'Compilation failed',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

async function compileSignals(): Promise<SignalPack> {
  // Check for cached result (fallback for demo)
  const cachedPath = join(__dirname, '..', 'cached-result.json');

  // Try live compilation with timeout
  const TIMEOUT_MS = 60000; // 60 seconds for Gemini

  try {
    const result = await Promise.race([
      liveCompile(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini timeout')), TIMEOUT_MS)
      )
    ]);

    // Save successful result as cache
    try {
      const fs = await import('fs');
      fs.writeFileSync(cachedPath, JSON.stringify(result, null, 2));
      console.log('[compile] Cached result saved');
    } catch (e) {
      // Ignore cache save errors
    }

    return result;
  } catch (error) {
    console.warn('[compile] Live compilation failed, checking cache...', error);

    // Try cached result
    if (existsSync(cachedPath)) {
      console.log('[compile] Using cached result');
      const cached = JSON.parse(readFileSync(cachedPath, 'utf-8'));
      return { ...cached, _cached: true };
    }

    throw error;
  }
}

async function liveCompile(): Promise<SignalPack> {
  // Find demo artifacts
  const artifactsDir = join(__dirname, '..', 'demo-artifacts');
  const parentDir = join(__dirname, '..', '..');

  // Build content parts for Gemini
  const parts: any[] = [{ text: SIGNAL_COMPILER_PROMPT }];

  for (const artifact of DEMO_ARTIFACTS) {
    // Try demo-artifacts folder first, then parent folder
    let filePath = join(artifactsDir, artifact.file);
    if (!existsSync(filePath)) {
      filePath = join(parentDir, artifact.file);
    }

    if (!existsSync(filePath)) {
      console.warn(`[compile] Artifact not found: ${artifact.file}`);
      continue;
    }

    console.log(`[compile] Loading: ${artifact.name}`);
    const data = readFileSync(filePath);

    parts.push({ text: `\n\n--- Document: ${artifact.name} ---\n` });
    parts.push({
      inlineData: {
        mimeType: 'application/pdf',
        data: data.toString('base64'),
      },
    });
  }

  if (parts.length < 3) {
    throw new Error('No demo artifacts found. Please copy PDFs to demo-artifacts/ folder.');
  }

  console.log(`[compile] Sending ${parts.length} parts to Gemini...`);

  // Call Gemini
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-exp',  // Use available model
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  });

  const result = await model.generateContent(parts);
  const response = result.response;
  const text = response.text();

  console.log(`[compile] Received response (${text.length} chars)`);

  // Parse response
  let parsed: GeminiSignalResponse;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    console.error('[compile] Failed to parse Gemini response:', text.slice(0, 500));
    throw new Error('Invalid JSON from Gemini');
  }

  // Verify evidence (the one rule that matters)
  const verified = verifyEvidence(parsed);

  return {
    case_id: 'agrinova_w04_2026',
    processed_at: new Date().toISOString(),
    ...verified,
  };
}

function verifyEvidence(pack: GeminiSignalResponse): Omit<SignalPack, 'case_id' | 'processed_at' | '_cached'> {
  const signals = pack.signals || [];
  const drops: Drop[] = pack.drops || [];
  const conflicts = pack.conflicts || [];
  const next_checks = pack.next_checks || [];

  // Basic sanity check: every signal has evidence
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
╔════════════════════════════════════════════════════════╗
║  Signal Compiler - Executive Agent Harness             ║
║  Running at http://localhost:${PORT}                       ║
║                                                        ║
║  POST /compile  - Compile signals from demo artifacts  ║
║  GET  /health   - Health check                         ║
╚════════════════════════════════════════════════════════╝
  `);

  if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️  GEMINI_API_KEY not set. Set it with: export GEMINI_API_KEY=your_key');
  }
});
