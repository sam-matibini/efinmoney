// Shared spreadsheet helpers for admin tables: CSV / XLSX download and import parsing.
import * as XLSX from "xlsx";
import { format } from "date-fns";

const stamp = () => format(new Date(), "yyyy-MM-dd");

export interface Sheet {
  name: string;
  header: string[];
  rows: Array<Array<unknown>>;
}

export const downloadCsv = (filenameBase: string, header: string[], rows: Array<Array<unknown>>) => {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [header.join(","), ...rows.map((r) => r.map(esc).join(","))];
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameBase}-${stamp()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

/** Write one or more sheets to a real .xlsx workbook. */
export const downloadXlsx = (filenameBase: string, sheets: Sheet[]) => {
  const wb = XLSX.utils.book_new();
  for (const s of sheets.length ? sheets : [{ name: "Sheet1", header: [], rows: [] }]) {
    const ws = XLSX.utils.aoa_to_sheet([s.header, ...s.rows]);
    ws["!cols"] = s.header.map((h, i) => ({
      wch: Math.min(
        40,
        Math.max(10, h.length + 2, ...s.rows.slice(0, 200).map((r) => String(r[i] ?? "").length + 2)),
      ),
    }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, `${filenameBase}-${stamp()}.xlsx`);
};

/** Parse an uploaded CSV/XLSX file into row objects keyed by the header labels. */
export const parseSpreadsheet = async (file: File): Promise<Record<string, string>[]> => {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
  return raw.map((r) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) out[String(k).trim()] = String(v ?? "").trim();
    return out;
  });
};
