import { fail } from './model.mjs';
import { createRequire } from 'node:module';
import { dirname, join, sep } from 'node:path';

const require = createRequire(import.meta.url);

function inspectZip(buffer) {
  // DOCX is ZIP. Bound expanded data before the parser decompresses it.
  let total = 0, count = 0;
  for (let pos = 0; pos + 46 <= buffer.length; pos++) {
    if (buffer.readUInt32LE(pos) !== 0x02014b50) continue;
    const size = buffer.readUInt32LE(pos+24);
    if (size === 0xffffffff) fail('ZIP64 documents are not supported.');
    total += size; count++;
    if (total > 25000000 || count > 1000) fail('Document expands beyond the 25 MB limit.');
    const length = buffer.readUInt16LE(pos+28)+buffer.readUInt16LE(pos+30)+buffer.readUInt16LE(pos+32);
    pos += 45 + length;
  }
  if (!count) fail('Invalid DOCX archive.');
}
export async function extractResume(buffer, filename) {
  const ext = filename.toLowerCase().split('.').pop();
  let text;
  if (['txt','md'].includes(ext)) text = new TextDecoder('utf-8',{fatal:true}).decode(buffer);
  else if (ext==='docx') {
    inspectZip(buffer);
    const { default: mammoth } = await import('mammoth');
    text = (await mammoth.extractRawText({buffer})).value;
  } else if (ext==='pdf') {
    const {getDocument} = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const standardFontDataUrl = join(dirname(require.resolve('pdfjs-dist/package.json')),'standard_fonts') + sep;
    const task = getDocument({data:new Uint8Array(buffer),standardFontDataUrl,isEvalSupported:false,useSystemFonts:false,disableFontFace:true,stopAtErrors:true});
    try {
      const doc = await task.promise;
      if (doc.numPages>50) fail('Use a resume with 50 pages or fewer.');
      const pages=[];
      for (let i=1;i<=doc.numPages;i++) {
        const page=await doc.getPage(i), content=await page.getTextContent();
        pages.push(content.items.map(x=>x.str+(x.hasEOL?'\n':' ')).join(''));
      }
      text=pages.join('\n\n');
    } finally { await task.destroy(); }
  } else fail('Upload a TXT, MD, PDF or DOCX file.');
  text=text.trim();
  if (!text) fail('No readable text found. Scanned PDFs need OCR; paste their text instead.');
  if (text.length>150000) fail('Extracted resume is too long.');
  return text;
}
