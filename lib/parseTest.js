const { extractPages, toLines } = require('./pdfExtract');

// Header/footer patterns to strip
const HF_RE = [
  /vajiram\s*(&|and)\s*ravi/i,
  /prelims\s*test\s*series/i,
  /full\s*length\s*test/i,
  /test\s*booklet/i,
  /maximum\s*marks/i,
  /time\s*allowed/i,
  /do\s*not\s*open/i,
  /commencement\s*of\s*the\s*examination/i,
  /unprinted\s*or\s*torn/i,
  /candidate.s\s*responsibility/i,
  /roll\s*number/i,
  /omr\s*answer/i,
  /answer\s*sheet/i,
  /penalty\s*for\s*wrong/i,
  /wrong\s*answers\s*marked/i,
  /alternatives\s*for\s*the\s*answer/i,
  /question\s*is\s*left\s*blank/i,
  /test\s*booklet\s*contains\s*\d+/i,
  /^r\d{4}$/i,
  /^\d{1,3}$/,
];

function isHF(text) {
  return HF_RE.some(r => r.test(text.trim()));
}

function isCoverPage(lines) {
  const joined = lines.map(l => l.text).join(' ');
  return !/\(a\)/i.test(joined) && !/\(b\)/i.test(joined);
}

async function parseTestPdf(buffer) {
  const pages = await extractPages(buffer);
  const questions = {};

  for (const page of pages) {
    const allLines = toLines(page.items);
    const cleaned = allLines.filter(l => !isHF(l.text));
    if (isCoverPage(cleaned)) continue;

    const midX = page.width / 2;
    const leftItems  = page.items.filter(i => i.x < midX - 30);
    const rightItems = page.items.filter(i => i.x >= midX - 30);
    const isTwoCols  = leftItems.length > 8 && rightItems.length > 8;

    let pageText;
    if (isTwoCols) {
      const leftLines  = toLines(leftItems).filter(l => !isHF(l.text));
      const rightLines = toLines(rightItems).filter(l => !isHF(l.text));
      pageText = leftLines.map(l => l.text).join('\n') + '\n' + rightLines.map(l => l.text).join('\n');
    } else {
      pageText = cleaned.map(l => l.text).join('\n');
    }

    extractQuestionsFromText(pageText, questions);
  }

  return questions;
}

function extractQuestionsFromText(rawText, qMap) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  let curNum = null, body = [], opts = [], inOpts = false;

  function flush() {
    if (curNum === null) return;
    if (opts.length >= 2) {
      if (!qMap[curNum]) {
        qMap[curNum] = { num: curNum, bodyLines: [...body], options: [...opts] };
      } else if (qMap[curNum].options.length < opts.length) {
        qMap[curNum] = { num: curNum, bodyLines: [...body], options: [...opts] };
      }
    }
    curNum = null; body = []; opts = []; inOpts = false;
  }

  for (const line of lines) {
    const optM = line.match(/^\(([a-d])\)\s+(.+)$/i);
    if (optM && curNum !== null) {
      inOpts = true;
      opts.push({ letter: optM[1].toLowerCase(), text: optM[2].trim() });
      continue;
    }

    const qM = line.match(/^(\d{1,3})\.\s{1,6}(.+)$/);
    if (qM) {
      const n = parseInt(qM[1]);
      if (n >= 1 && n <= 100) {
        const isSubStatement = curNum !== null && !inOpts && n !== curNum + 1 && n <= 6;
        if (!isSubStatement || curNum === null) {
          flush();
          curNum = n; body = [qM[2].trim()]; opts = []; inOpts = false;
          continue;
        }
      }
    }

    if (inOpts && opts.length > 0 && curNum !== null) {
      if (!line.match(/^\(([a-d])\)/i)) {
        opts[opts.length - 1].text += ' ' + line;
      }
      continue;
    }

    if (curNum !== null && !inOpts) body.push(line);
  }
  flush();
}

module.exports = { parseTestPdf };
