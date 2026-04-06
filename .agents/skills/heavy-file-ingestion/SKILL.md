---
name: Heavy File Ingestion
description: Pre-processes large PDFs and spreadsheets into Markdown/CSV for safe graph insertion.
---

# SKILL: Heavy File Ingestion

## Purpose
To handle large file artifacts efficiently, this skill outlines how to run local ingestion scripts before sending payloads into the Supabase database.

## Instructions
1. If presented with a large PDF, DOCX, or Excel file, DO NOT attempt to read it entirely into context.
2. Execute the accompanying script `.agents/skills/heavy-file-ingestion/scripts/ingest.ts` path/to/file.
3. The script will output a synthesized Markdown or CSV format.
4. Pass the synthesized output into the `capture_memory` tool or attach it to relevant threads.
