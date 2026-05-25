const { extractFullText } = require('./pdfExtract');

async function parseSolutionPdf(buffer) {
  const allText = await extractFullText(buffer);
  const answers = {};
  const explanations = {};

  // ── Answer Key: "1. (c)   2. (b) ..." ─────────────────────────
  const ansRe = /\b(\d{1,3})\.\s*\(([a-d])\)/gi;
  let m;
  while ((m = ansRe.exec(allText)) !== null) {
    const n = parseInt(m[1]);
    if (n >= 1 && n <= 100) answers[n] = m[2].toLowerCase();
  }

  // ── Explanations: split on "Q{n}.\n" blocks ───────────────────
  // pdf-parse puts these on their own lines
  const blockRe = /Q(\d{1,3})\.\s*[\n\r]/g;
  const blockStarts = [];
  let bm;
  while ((bm = blockRe.exec(allText)) !== null) {
    blockStarts.push({ num: parseInt(bm[1]), start: bm.index + bm[0].length });
  }

  // Fallback: also try "Q{n}." at start of line
  if (blockStarts.length === 0) {
    const altRe = /^Q(\d{1,3})\.\s*$/gm;
    while ((bm = altRe.exec(allText)) !== null) {
      blockStarts.push({ num: parseInt(bm[1]), start: bm.index + bm[0].length });
    }
  }

  blockStarts.sort((a, b) => a.start - b.start);

  for (let i = 0; i < blockStarts.length; i++) {
    const { num, start } = blockStarts[i];
    const end = i + 1 < blockStarts.length ? blockStarts[i + 1].start : allText.length;
    const raw = allText.slice(start, end);
    const cleaned = cleanExplanation(raw);
    if (cleaned.length > 20) explanations[num] = cleaned;
  }

  return { answers, explanations };
}

function cleanExplanation(raw) {
  let text = raw;
  // Remove answer letter line
  text = text.replace(/^Answer\s*:?\s*[a-d]\s*$/gmi, '');
  text = text.replace(/^Explanation\s*:?\s*$/gmi, '');
  // Remove verdict sentences
  text = text.replace(/Therefore[,\s]+option\s*\([a-d]\)\s*is\s*the\s*correct\s*answer\.?[^\n]*/gi, '');
  text = text.replace(/So[,\s]+option\s*\([a-d]\)\s*is\s*the\s*correct\s*answer\.?[^\n]*/gi, '');
  text = text.replace(/Therefore[,\s]+the\s*correct\s*answer[^\n]*/gi, '');
  text = text.replace(/Hence[,\s]+option\s*\([a-d]\)[^\n]*/gi, '');
  // Remove relevance lines
  text = text.replace(/Relevance\s*:[^\n]*/gi, '');
  // Remove bullet symbols
  text = text.replace(/[●○•▪◆▸▹→]/g, '');
  // Remove Q{n} leftovers
  text = text.replace(/^Q\d{1,3}\.\s*/gm, '');
  // Join all lines into one paragraph
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
  return lines.join(' ').replace(/\s{2,}/g, ' ').replace(/\.\s*\./g, '.').trim();
}

module.exports = { parseSolutionPdf };
