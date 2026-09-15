/**
 * CSV serialisation with spreadsheet-formula-injection defence.
 *
 * Policy (documented in docs/analyst-export-v1.md):
 *   - A field whose text begins with `=`, `+`, `-`, `@`, TAB or CR is prefixed
 *     with a single quote (`'`) in the EXPORTED representation only. Canonical
 *     evidence text is never mutated.
 *   - Every field is wrapped in double quotes; embedded quotes are doubled.
 *   - Rows are joined with CRLF (the RFC 4180 line ending Excel expects).
 *
 * This module has no dependency on the read model and is unit-tested directly.
 */

const FORMULA_LEAD = /^[=+\-@\t\r]/;

/** Escape one cell value for CSV output. `null`/`undefined` become an empty field. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  let s = typeof value === "number" ? String(value) : value;
  if (FORMULA_LEAD.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Serialise a header row + data rows into an RFC 4180 CSV string. */
export function toCsv(header: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const lines = [header.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))];
  return lines.join("\r\n") + "\r\n";
}
