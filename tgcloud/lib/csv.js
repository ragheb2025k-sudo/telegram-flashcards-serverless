// ---------------------------------------------------------------------------
// lib/csv.js — minimal RFC-4180-ish CSV reader/writer (RFC 4180 style).
// ---------------------------------------------------------------------------

// Parse a delimited text into rows of cells. Handles quoted fields with
// embedded delimiters/newlines and escaped quotes ("").
export function parseCsv(text, delimiter = ',') {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  const push = () => { row.push(cell); cell = ''; };
  const endRow = () => { push(); rows.push(row); row = []; };

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      cell += ch; i++; continue;
    }
    if (ch === '"' && cell === '') { inQuotes = true; i++; continue; }
    if (ch === delimiter) { push(); i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { endRow(); i++; continue; }
    cell += ch; i++;
  }
  if (cell !== '' || row.length) endRow();
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

// Escape a single cell for CSV output.
function csvCell(v) {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// Build CSV text from rows of cells (delimiter `,`, CRLF line endings).
export function toCsv(rows) {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export { csvCell };
