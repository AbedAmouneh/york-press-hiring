import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { checkCv, docxText } from "../../server/services/cv-text.js";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** A minimal zip with one deflated file, laid out like a .docx (CRCs aren't checked by the reader). */
function zipWith(name: string, content: string) {
  const nameBytes = Buffer.from(name);
  const data = deflateRawSync(Buffer.from(content));
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE(0, 42);
  const centralOffset = local.length + nameBytes.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nameBytes.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  return new Uint8Array(Buffer.concat([local, nameBytes, data, central, nameBytes, end]));
}

const documentXml = `<w:document><w:body><w:p><w:r><w:t>Rana Haddad</w:t></w:r></w:p><w:p><w:r><w:t>Senior Editor &amp; writer</w:t></w:r></w:p></w:body></w:document>`;

describe("CV files", () => {
  it("reads the text of a Word (.docx) CV", () => {
    const docx = zipWith("word/document.xml", documentXml);
    expect(checkCv(docx, DOCX)).toEqual({ ok: true, kind: "docx" });
    expect(docxText(docx)).toBe("Rana Haddad\nSenior Editor & writer");
  });

  it("refuses files that aren't what they claim to be", () => {
    const text = new TextEncoder().encode("just some text");
    expect(checkCv(text, "application/pdf")).toMatchObject({ ok: false });
    expect(checkCv(text, DOCX)).toMatchObject({ ok: false });
    expect(checkCv(zipWith("other.xml", "<x/>"), DOCX)).toMatchObject({ ok: false });
    expect(checkCv(new Uint8Array(), "text/plain")).toMatchObject({ ok: false, problem: "That file is empty." });
    expect(checkCv(text, "application/msword")).toMatchObject({ ok: false });
  });

  it("accepts real PDFs and plain text", () => {
    expect(checkCv(new TextEncoder().encode("%PDF-1.7\n..."), "application/pdf")).toEqual({ ok: true, kind: "pdf" });
    expect(checkCv(new TextEncoder().encode("Plain CV"), "text/plain")).toEqual({ ok: true, kind: "text" });
  });
});
