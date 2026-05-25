const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

// Extract pages with positioned text items from a PDF buffer
async function extractPages(buffer) {
  const data = new Uint8Array(buffer);
  const pdf = await pdfjsLib.getDocument({ data, disableFontFace: true, verbosity: 0 }).promise;
  const pages = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = tc.items
      .filter(it => it.str && it.str.trim())
      .map(it => ({
        text: it.str,
        x: Math.round(it.transform[4]),
        y: Math.round(vp.height - it.transform[5]),
        w: Math.round(it.width),
      }));
    pages.push({ items, width: vp.width, height: vp.height, num: p });
  }
  return pages;
}

// Group items into lines by y-proximity, sorted left-to-right
function toLines(items, yTol = 5) {
  if (!items.length) return [];
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const groups = [];
  let cur = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].y - cur[0].y) <= yTol) {
      cur.push(sorted[i]);
    } else {
      groups.push(cur);
      cur = [sorted[i]];
    }
  }
  groups.push(cur);
  return groups
    .map(g => ({
      y: g[0].y,
      x: Math.min(...g.map(i => i.x)),
      text: g.sort((a, b) => a.x - b.x).map(i => i.text).join(' ').replace(/\s{2,}/g, ' ').trim(),
    }))
    .filter(l => l.text.length > 0);
}

module.exports = { extractPages, toLines };
