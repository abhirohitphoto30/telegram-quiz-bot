const { extractPages, toLines } = require('./pdfExtract');

const HF_RE = [
  /vajiram\s*(&|and)\s*ravi/i,
  /prelims\s*test\s*series/i,
  /full\s*length\s*test/i,
  /^r\d{4}$/i,
  /^\d{1,3}$/,
];

function isHF(text) {
  return HF_RE.some(r => r.test(text.trim()));
}

async function parseSolutionPdf(buffer) {
  const pages = await extractPages(buffer);
  const answers = {};
  const explanations = {};

  const allText = pages.map(page => {
    const lines = toLines(page.items).filter(l => !isHF(l.text));
    return lines.map(l => l.text).join('\n');
  }).join('\n');

  // Parse answer key: "1. (c)   2. (b) ..."
  const ansRe = /\b(\d{1,3})\.\s*\(([a-d])\)/gi;
  let m;
  while ((m = ansRe.exec(allText)) !== null) {
    const n = parseInt(m[1]);
    if (n >= 1 && n <= 100) answers[n] = m[2].toLowerCase();
  }

  // Parse explanations: split on Q{n}. blocks
  const blockStarts = [];
  const re2 = /\nQ(\d{1,3})\.\s*\n/g;
  let bm;
  while ((bm = re2.exec(allText)) !== null) {
    blockStarts.push({ num: parseInt(bm[1]), start: bm.index + bm[0].length });
  }

  for (let bi = 0; bi < blockStarts.length; bi++) {
    const { num, start } = blockStarts[bi];
    const end = bi + 1 < blockStarts.length ? blockStarts[bi + 1].start : allText.length;
    const raw = allText.slice(start, end);
    const cleaned = cleanExplanation(raw);
    if (cleaned.length > 20) explanations[num] = cleaned;
  }

  return { answers, explanations };
}

function cleanExplanation(raw) {
  let text = raw;
  text = text.replace(/^Answer\s*:\s*[a-d]\s*$/gmi, '');
  text = text.replace(/^Explanation\s*:\s*$/gmi, '');
  text = text.replace(/Therefore[,\s]+option\s*\([a-d]\)\s*is\s*the\s*correct\s*answer\.?[^\n]*/gi, '');
  text = text.replace(/So[,\s]+option\s*\([a-d]\)\s*is\s*the\s*correct\s*answer\.?[^\n]*/gi, '');
  text = text.replace(/Therefore[,\s]+the\s*correct\s*answer[^\n]*/gi, '');
  text = text.replace(/Relevance\s*:[^\n]*/gi, '');
  text = text.replace(/^(?:Source|Ref|Reference)\s*:[^\n]*/gmi, '');
  text = text.replace(/^[\s]*[●○•▪◆▸▹→\-–—]+\s*/gm, '');
  text = text.replace(/^\s+[●○•▪]+\s*/gm, ' ');
  text = text.replace(/^Q\d{1,3}\.\s*/gm, '');

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
  let result = lines.join(' ').replace(/\s{2,}/g, ' ').replace(/\.\s*\./g, '.').trim();
  return result;
}

module.exports = { parseSolutionPdf };
