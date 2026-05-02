#!/usr/bin/env -S deno run -A --env
/**
 * backup.ts -- Export all my-ob1 Supabase tables to local JSON files.
 *
 * Adapted from community recipe to Deno/TypeScript for the my-ob1 architecture.
 * Paginates through PostgREST (1000 rows per request).
 */

import { join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { format } from "https://deno.land/std@0.224.0/datetime/mod.ts";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PAGE_SIZE = 1000;

const TABLES = [
  { name: "memories",               orderBy: "id" },
  { name: "tasks",                  orderBy: "id" },
  { name: "entities",               orderBy: "id" },
  { name: "memory_entities",        orderBy: "memory_id,entity_id" },
  { name: "artifacts",              orderBy: "id" },
  { name: "system_insights",        orderBy: "id" },
  { name: "threads",                orderBy: "id" },
  { name: "memory_threads",         orderBy: "memory_id,thread_id" },
  { name: "entity_wikis",           orderBy: "id" },
  { name: "memory_edges",           orderBy: "id" },
  { name: "entity_edges",           orderBy: "id" },
  { name: "taste_preferences",      orderBy: "id" },
  { name: "mcp_operation_queue",    orderBy: "id" },
  { name: "system_config",          orderBy: "key" },
  { name: "learning_topics",        orderBy: "id" },
  { name: "memory_learning_topics", orderBy: "memory_id,topic_id" },
  { name: "learning_milestones",    orderBy: "id" },
];

// ---------------------------------------------------------------------------
// Env loading
// ---------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in environment.\n" +
    "Ensure they are set in your environment or provided via --env flag with a .env file."
  );
  Deno.exit(1);
}

const REST_BASE = `${SUPABASE_URL}/rest/v1`;

const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "count=exact",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function today() {
  return format(new Date(), "yyyy-MM-dd");
}

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Fetch a single page of rows from a table. */
async function fetchPage(table: string, orderBy: string, offset: number, limit: number) {
  const url = `${REST_BASE}/${table}?order=${orderBy}&limit=${limit}&offset=${offset}`;
  const rangeEnd = offset + limit - 1;
  
  const res = await fetch(url, {
    headers: {
      ...HEADERS,
      Range: `${offset}-${rangeEnd}`,
    },
  });

  if (!res.ok && res.status !== 206) {
    const body = await res.text();
    throw new Error(`PostgREST error ${res.status} on ${table}: ${body}`);
  }

  let total: number | null = null;
  const cr = res.headers.get("content-range");
  if (cr) {
    const match = cr.match(/\/(\d+|\*)/);
    if (match && match[1] !== "*") total = parseInt(match[1], 10);
  }

  const rows = await res.json();
  return { rows, total };
}

/** Export one table, streaming rows to disk. */
async function exportTable(tableName: string, orderBy: string, backupDir: string, dateStr: string) {
  const filePath = join(backupDir, `${tableName}-${dateStr}.json`);
  let offset = 0;
  let rowCount = 0;

  const first = await fetchPage(tableName, orderBy, 0, PAGE_SIZE);
  const total = first.total;

  const label = `  ${tableName}`;
  if (first.rows.length === 0) {
    console.log(`${label}: 0 rows (empty table)`);
    await Deno.writeTextFile(filePath, "[]");
    return { rowCount: 0, filePath, fileSize: 2 };
  }

  using file = await Deno.open(filePath, { write: true, create: true, truncate: true });
  const writer = file.writable.getWriter();
  const encoder = new TextEncoder();

  await writer.write(encoder.encode("[\n"));
  let firstRow = true;

  async function writeRows(rows: any[]) {
    for (const row of rows) {
      if (!firstRow) await writer.write(encoder.encode(",\n"));
      await writer.write(encoder.encode(JSON.stringify(row)));
      firstRow = false;
      rowCount++;
    }
  }

  await writeRows(first.rows);
  Deno.stdout.write(encoder.encode(
    `${label}: ${rowCount}${total != null ? "/" + total : ""} rows\r`
  ));

  offset = PAGE_SIZE;
  while (first.rows.length === PAGE_SIZE && (total == null || offset < total)) {
    const page = await fetchPage(tableName, orderBy, offset, PAGE_SIZE);
    if (page.rows.length === 0) break;
    await writeRows(page.rows);
    offset += page.rows.length;

    Deno.stdout.write(encoder.encode(
      `${label}: ${rowCount}${total != null ? "/" + total : ""} rows\r`
    ));
  }

  await writer.write(encoder.encode("\n]"));
  await writer.close();

  const fileInfo = await Deno.stat(filePath);
  const fileSize = fileInfo.size;

  console.log(
    `${label}: ${rowCount} rows (${humanSize(fileSize)})               `
  );

  return { rowCount, filePath, fileSize };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const dateStr = today();
  const backupDir = join(Deno.cwd(), "backup");

  try {
    await Deno.mkdir(backupDir, { recursive: true });
    console.log(`Ensured directory: ${backupDir}`);
  } catch (err) {
    if (!(err instanceof Deno.errors.AlreadyExists)) throw err;
  }

  console.log(`\nOpen Brain Backup -- ${dateStr}`);
  console.log(`Target: ${backupDir}\n`);

  const results = [];
  for (const table of TABLES) {
    try {
      const result = await exportTable(table.name, table.orderBy, backupDir, dateStr);
      results.push({ table: table.name, ...result });
    } catch (err: any) {
      console.error(`\n  ERROR exporting ${table.name}: ${err.message}`);
      results.push({ table: table.name, rowCount: 0, filePath: null, fileSize: 0, error: err.message });
    }
  }

  const totalRows = results.reduce((s, r) => s + r.rowCount, 0);
  const totalSize = results.reduce((s, r) => s + r.fileSize, 0);

  console.log("\n--- Backup Summary ---");
  console.log(`Date:  ${dateStr}`);
  console.log(`Dir:   ${backupDir}\n`);

  const colTable = "Table".padEnd(25);
  const colRows  = "Rows".padStart(8);
  const colSize  = "Size".padStart(10);
  console.log(`${colTable}${colRows}${colSize}`);
  console.log("-".repeat(43));

  for (const r of results) {
    const name = r.table.padEnd(25);
    const rows = String(r.rowCount).padStart(8);
    const size = (r.error ? "ERROR" : humanSize(r.fileSize)).padStart(10);
    console.log(`${name}${rows}${size}`);
  }

  console.log("-".repeat(43));
  console.log(`${"TOTAL".padEnd(25)}${String(totalRows).padStart(8)}${humanSize(totalSize).padStart(10)}`);
  console.log(`\nDone. ${results.filter(r => !r.error).length}/${results.length} tables exported successfully.`);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    Deno.exit(1);
  });
}
