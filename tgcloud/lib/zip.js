// ---------------------------------------------------------------------------
// lib/zip.js — minimal ZIP (PKZIP) writer + reader in pure JS.
//
// Writer produces STORE-mode archives (no compression) with UTF-8 names —
// perfect for backups, keeps the serverless runtime dependency-free.
// Reader parses the central directory and extracts STORE-mode entries
// (used for restoring backups produced by this bot).
// ---------------------------------------------------------------------------

// --- CRC-32 (IEEE 802.3), table-based ---------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// --- DOS date/time from a JS Date (local time of the runtime) ---------------
function dosDateTime(date) {
  const d = date instanceof Date ? date : new Date();
  const time = ((d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2))) & 0xFFFF;
  const day = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  return { time, day };
}

// --- writer -----------------------------------------------------------------
// files: [{ name: string, data: Uint8Array }]  → Uint8Array (the .zip bytes)
export function zipCreate(files) {
  const enc = new TextEncoder();
  const now = dosDateTime(new Date());
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const data = f.data instanceof Uint8Array ? f.data : enc.encode(String(f.data));
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);          // local file header signature
    lv.setUint16(4, 20, true);                  // version needed
    lv.setUint16(6, 0x0800, true);              // flags: UTF-8 names
    lv.setUint16(8, 0, true);                   // method: STORE
    lv.setUint16(10, now.time, true);
    lv.setUint16(12, now.day, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);        // compressed size
    lv.setUint32(22, data.length, true);        // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);                  // extra length
    local.set(nameBytes, 30);
    locals.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);          // central dir signature
    cv.setUint16(4, 20, true);                  // version made by
    cv.setUint16(6, 20, true);                  // version needed
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);                  // method STORE
    cv.setUint16(12, now.time, true);
    cv.setUint16(14, now.day, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);                  // extra
    cv.setUint16(32, 0, true);                  // comment
    cv.setUint16(34, 0, true);                  // disk number
    cv.setUint16(36, 0, true);                  // internal attrs
    cv.setUint32(38, 0, true);                  // external attrs
    cv.setUint32(42, offset, true);             // local header offset
    central.set(nameBytes, 46);
    centrals.push(central);

    offset += local.length + data.length;
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const total = offset + centralSize + 22;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const part of [...locals, ...centrals, eocd]) { out.set(part, pos); pos += part.length; }
  return out;
}

// --- reader (STORE-mode entries; e.g. our own backups) ----------------------
// returns [{ name, data: Uint8Array }] — throws 'ZIP_COMPRESSED' for deflated entries
export function zipRead(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // locate EOCD (scan the last 64KB+22 for the signature)
  let eocd = -1;
  const minStart = Math.max(0, bytes.length - (65535 + 22));
  for (let i = bytes.length - 22; i >= minStart; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP_EOCD');

  const count = dv.getUint16(eocd + 10, true);
  let ptr = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const entries = [];

  for (let k = 0; k < count; k++) {
    if (dv.getUint32(ptr, true) !== 0x02014b50) break;
    const method = dv.getUint16(ptr + 10, true);
    const compSize = dv.getUint32(ptr + 20, true);
    const nameLen = dv.getUint16(ptr + 28, true);
    const extraLen = dv.getUint16(ptr + 30, true);
    const commentLen = dv.getUint16(ptr + 32, true);
    const localOff = dv.getUint32(ptr + 42, true);
    const name = dec.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    if (method !== 0) throw new Error('ZIP_COMPRESSED');

    // skip the local header to reach the data
    if (dv.getUint32(localOff, true) !== 0x04034b50) throw new Error('ZIP_LOCAL');
    const lNameLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    entries.push({ name, data: bytes.slice(dataStart, dataStart + compSize) });
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

// find a named entry inside a ZIP buffer (name matched without folder prefix)
export function zipFind(bytes, filename) {
  const entries = zipRead(bytes);
  const wanted = filename.toLowerCase().split('/').pop();
  for (const e of entries) {
    const base = e.name.toLowerCase().split('/').pop();
    if (base === wanted) return e;
  }
  return null;
}
