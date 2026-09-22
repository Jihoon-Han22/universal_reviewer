// Local Node previews can opportunistically read PDF text before the trusted
// sandbox analysis. Sites replaces this module with its deferred counterpart.
const MAX_SOURCE = 1_500_000;

export async function pdfText(buffer) {
  let loading;
  let timer;
  try {
    const work = async () => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      loading = pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false, verbosity: 0 });
      const doc = await loading.promise;
      const pages = [];
      let remaining = MAX_SOURCE;
      for (let page = 1; page <= Math.min(doc.numPages, 30) && remaining > 0; page++) {
        const contents = await (await doc.getPage(page)).getTextContent();
        const text = contents.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('').slice(0, remaining);
        remaining -= text.length; pages.push({ page, text });
      }
      return pages;
    };
    return await Promise.race([work(), new Promise(resolve => { timer = setTimeout(() => resolve([]), 25000); timer.unref?.(); })]);
  } catch { return []; } finally { clearTimeout(timer); await loading?.destroy().catch(() => {}); }
}
