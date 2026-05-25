const { extractFullText } = require('./pdfExtract');

const HF_PATTERNS = [
  /vajiram\s*(&|and)\s*ravi/i,
  /prelims\s*test\s*series/i,
  /full\s*length\s*test/i,
  /test\s*booklet/i,
  /maximum\s*marks/i,
  /time\s*allowed/i,
  /do\s*not\s*open/i,
  /commencement\s*of\s*the\s*examination/i,
  /candidate.s\s*responsibility/i,
  /omr\s*answer/i,
  /answer\s*sheet/i,
  /penalty\s*for\s*wrong/i,
  /wrong\s*answers\s*marked/i,
  /question\s*is\s*left\s*blank/i,
  /test\s*booklet\s*contains/i,
];

function isJunk(line) {
  const t = line.trim();
  if (!t || /^r\d{4}$/i.test(t) || /^\d{1,3}$/.test(t)) return true;
  return HF_PATTERNS.some(r => r.test(t));
}

async function parseTestPdf(buffer) {
  const rawText = await extractFullText(buffer);
  const questions = {};
  parseQuestionsFromText(rawText, questions);
  return questions;
}

function parseQuestionsFromText(rawText, qMap) {
  // Clean junk lines
  const lines = rawText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !isJunk(l));

  let curNum = null, body = [], opts = [], inOpts = false;

  function flush() {
    if (curNum === null) return;
    if (opts.length >= 2) {
      if (!qMap[curNum] || qMap[curNum].options.length < opts.length) {
        qMap[curNum] = { num: curNum, bodyLines: [...body], options: [...opts] };
      }
    }
    curNum = null; body = []; opts = []; inOpts = false;
  }

  for (const line of lines) {
    // Option line: (a) text  or  (a)text
    const optM = line.match(/^\(([a-d])\)\s*(.*)$/i);
    if (optM && curNum !== null) {
      inOpts = true;
      opts.push({ letter: optM[1].toLowerCase(), text: optM[2].trim() });
      continue;
    }

    // New question: starts with number 1-100 followed by period and text
    const qM = line.match(/^(\d{1,3})\.\s+(.+)$/);
    if (qM) {
      const n = parseInt(qM[1]);
      if (n >= 1 && n <= 100) {
        // Distinguish question vs sub-statement:
        // sub-statements come while in a question, are small numbers (1-8), not sequential
        const isSubStmt = curNum !== null && !inOpts && n <= 8 && n !== curNum + 1;
        if (!isSubStmt) {
          flush();
          curNum = n;
          body = [qM[2].trim()];
          opts = [];
          inOpts = false;
          continue;
        }
      }
    }

    if (inOpts && curNum !== null) {
      if (!line.match(/^\([a-d]\)/i) && opts.length > 0) {
        opts[opts.length - 1].text += ' ' + line;
      }
      continue;
    }

    if (curNum !== null && !inOpts) {
      body.push(line);
    }
  }
  flush();
}

module.exports = { parseTestPdf };
