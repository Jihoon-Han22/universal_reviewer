import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pdfText as nodePdfText } from './pdf-text.mjs';
import { pdfText as sitesPdfText } from './sites/pdf-text.mjs';
import { analyzeDocumentInSandbox } from './sandbox-documents.mjs';

function pdfFixture() {
  const stream = 'BT /F1 12 Tf 20 50 Td (Strength 31 MPa) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let source = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(source.length); source += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = source.length;
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(source);
}

test('Node still reads PDF preview text through its original PDF.js path', async () => {
  assert.deepEqual(await nodePdfText(pdfFixture()), [{ page: 1, text: 'Strength 31 MPa ' }]);
});

test('deferred Sites PDF text is replaced by admitted trusted-reader pages', async () => {
  const buffer = pdfFixture();
  const document = { id: 'pdf-worker', name: 'sample.pdf', kind: 'pdf', mime: 'application/pdf', buffer, verificationPages: await sitesPdfText(buffer) };
  assert.deepEqual(document.verificationPages, []);
  const pages = [{ page: 1, text: 'Strength 31 MPa' }];
  let originalUploaded = false;
  const sandbox = {
    files: {
      async write(entries) {
        const original = entries.find(entry => entry.path === '/home/user/document-input.bin');
        assert.deepEqual(Buffer.from(original.data), buffer);
        originalUploaded = true;
      },
      async read(location) {
        assert.equal(location, '/home/user/document-profile.json');
        return JSON.stringify({ kind: 'pdf', status: 'ready', sha256: createHash('sha256').update(buffer).digest('hex'), pages, inventory: { pageCount: 1 }, coverage: { complete: true }, warnings: [] });
      },
    },
    commands: { async run() { return { exitCode: 0, stdout: '', stderr: '' }; } },
  };
  const result = await analyzeDocumentInSandbox(document, { withSandbox: work => work(sandbox, () => {}), gemini: { generateJson() { assert.fail('Visual metadata should not invoke a model'); } } });
  assert.equal(originalUploaded, true);
  assert.deepEqual(result.verificationPages, pages);
  assert.equal(result.analysis.coverage.readerComplete, true);
  assert.equal(result.analysis.coverage.visualAnalysisPending, true);
  assert.equal(result.modelParts.at(-1).inlineData.data, buffer.toString('base64'));
});
