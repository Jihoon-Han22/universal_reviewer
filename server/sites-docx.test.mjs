import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import browserMammoth from 'mammoth/mammoth.browser.js';
import { parseDocument } from './documents.mjs';

test('DOCX extraction accepts identical bounded input in Node and browser builds', async () => {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>검토 결과 Strength 31 MPa</w:t></w:r></w:p></w:body></w:document>');
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  // A pooled/subarray Buffer must not expose bytes before or after this document.
  const surrounding = Buffer.concat([Buffer.from('unrelated prefix'), bytes, Buffer.from('unrelated suffix')]);
  const buffer = surrounding.subarray(16, 16 + bytes.length);
  let actualInput;
  const nodeMammoth = (await import('mammoth')).default;
  const original = nodeMammoth.extractRawText;
  nodeMammoth.extractRawText = input => { actualInput = input; return original(input); };
  let parsed;
  try { parsed = await parseDocument(buffer, 'docx'); } finally { nodeMammoth.extractRawText = original; }
  assert.deepEqual(Buffer.from(actualInput.arrayBuffer), bytes);
  assert.equal(actualInput.buffer, buffer);
  const browser = await browserMammoth.extractRawText(actualInput);
  assert.equal(parsed.source, browser.value);
  assert.equal(parsed.preview.text, '검토 결과 Strength 31 MPa\n\n');
});
