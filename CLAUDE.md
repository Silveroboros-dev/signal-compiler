# Signal Compiler - Claude Code Instructions

## Project Overview
Executive Agent Harness for Gemini 3 hackathon. Extracts evidence-backed signals from messy executive documents.

## Git Commit Rules
- Do NOT include Claude co-author attribution in commits
- Do NOT include "Generated with Claude Code" in commit messages
- Keep commit messages clean and professional

## Architecture
- Minimal: 3 TypeScript files + 1 HTML file
- Let Gemini do the heavy lifting
- No unnecessary abstractions

## Key Files
- `src/main.ts` - Express server + Gemini call
- `src/types.ts` - SignalPack interfaces
- `src/prompt.ts` - The one prompt that matters
- `public/index.html` - Display page

## Running
```bash
export GEMINI_API_KEY=your_key
npm run dev
```

## Demo Artifacts
5 PDFs in `demo-artifacts/` for the AgriNova W04 golden case.
