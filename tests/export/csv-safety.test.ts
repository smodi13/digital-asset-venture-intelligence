import { describe, it, expect } from "vitest";
import { csvCell, toCsv } from "@/lib/export/csv";

describe("CSV formula-injection defence", () => {
  it("prefixes a single quote to fields beginning with a formula lead character", () => {
    for (const lead of ["=", "+", "-", "@", "\t", "\r"]) {
      expect(csvCell(`${lead}cmd`)).toBe(`"'${lead}cmd"`);
    }
  });

  it("leaves safe text unmodified (still quoted)", () => {
    expect(csvCell("Acme raised a round")).toBe('"Acme raised a round"');
    expect(csvCell("a-b-c")).toBe('"a-b-c"'); // interior dash is fine
  });

  it("does not mutate canonical text semantics - only the exported cell is prefixed", () => {
    const original = "=SUM(A1:A2) per the filing";
    const cell = csvCell(original);
    expect(cell).toBe(`"'=SUM(A1:A2) per the filing"`);
    // the source string itself is untouched
    expect(original.startsWith("=")).toBe(true);
  });

  it("quotes commas, quotes, and newlines correctly", () => {
    expect(csvCell('he said "hi", then left')).toBe('"he said ""hi"", then left"');
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
  });

  it("renders null/undefined/number cleanly", () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
    expect(csvCell(42)).toBe('"42"');
    expect(csvCell(0)).toBe('"0"');
  });

  it("emits a valid RFC 4180 document with CRLF line endings", () => {
    const csv = toCsv(["a", "b"], [
      ["1", "x,y"],
      ["=2", "z"],
    ]);
    expect(csv).toBe('"a","b"\r\n"1","x,y"\r\n"\'=2","z"\r\n');
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(3);
  });
});
