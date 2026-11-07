// Checks an uploaded CV by its bytes, not only the type the browser claims, and turns a Word (.docx) file into
// plain text for scoring. No dependencies: a .docx is a zip with the text in word/document.xml.
import { inflateRawSync } from "node:zlib";

export type CvKind = "pdf" | "docx" | "text";
export type CvCheck = { ok: true; kind: CvKind } | { ok: false; problem: string };

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((x, i) => b[i] === x);
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const ZIP = [0x50, 0x4b, 0x03, 0x04]; // PK..

/** What the file really is. A file that doesn't match what it claims to be is refused with a clear message. */
export function checkCv(bytes: Uint8Array, mime: string): CvCheck {
  if (!bytes.length) return { ok: false, problem: "That file is empty." };
  if (mime === "application/pdf") return startsWith(bytes, PDF) ? { ok: true, kind: "pdf" } : { ok: false, problem: "That file isn't a real PDF. Please export it as PDF again." };
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return startsWith(bytes, ZIP) && findEntry(bytes, "word/document.xml") ? { ok: true, kind: "docx" } : { ok: false, problem: "That Word file can't be read. Please save it as PDF and upload it again." };
  }
  if (mime === "text/plain") {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 4096));
    return text.includes("\u0000") ? { ok: false, problem: "That file isn't plain text." } : { ok: true, kind: "text" };
  }
  return { ok: false, problem: "Please upload a PDF, Word (.docx) or text file." };
}

type Entry = { method: number; compressedSize: number; localOffset: number };

/** The central-directory record for one file in a zip, or null. */
function findEntry(b: Uint8Array, name: string): Entry | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // End of central directory: signature 0x06054b50, searched from the end (a comment may follow it).
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  for (let n = 0; n < count && p + 46 <= b.length; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) return null;
    const method = v.getUint16(p + 10, true);
    const compressedSize = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const localOffset = v.getUint32(p + 42, true);
    const entryName = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nameLen));
    if (entryName === name) return { method, compressedSize, localOffset };
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const MAX_TEXT_BYTES = 5 * 1024 * 1024;

/** The readable text of a .docx (paragraphs on their own lines), or null if it can't be read. */
export function docxText(b: Uint8Array): string | null {
  try {
    const e = findEntry(b, "word/document.xml");
    if (!e) return null;
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (v.getUint32(e.localOffset, true) !== 0x04034b50) return null;
    const start = e.localOffset + 30 + v.getUint16(e.localOffset + 26, true) + v.getUint16(e.localOffset + 28, true);
    const data = b.subarray(start, start + e.compressedSize);
    const xmlBytes = e.method === 0 ? data : e.method === 8 ? inflateRawSync(data, { maxOutputLength: MAX_TEXT_BYTES }) : null;
    if (!xmlBytes) return null;
    const xml = new TextDecoder().decode(xmlBytes);
    return xml
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br\/>|<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } catch {
    return null;
  }
}
