// Convert Roman numeral prefix to Arabic: "I. text" → "1. text"
function convertRoman(line) {
  return line.replace(
    /^(I{1,3}|IV|VI{0,3}|IX|XI{0,3})\.\s+/,
    (m, roman) => {
      const map = { I:1, II:2, III:3, IV:4, V:5, VI:6, VII:7, VIII:8, IX:9, X:10, XI:11, XII:12 };
      const n = map[roman.toUpperCase()];
      return n ? n + '. ' : m;
    }
  );
}

// Intelligently join PDF-wrapped lines into proper logical lines
function smartJoinBodyLines(rawLines) {
  const lines = rawLines.map(l => convertRoman(l.trim())).filter(l => l.length > 0);
  if (!lines.length) return [];

  const NEW_LINE_RE = [
    /^\d{1,2}\.\s+\S/,
    /^Statement\s+[IVXLC]+\s*:/i,
    /^(Which|How\s+many|How\s+|What|Select|Arrange|In\s+how|Who\s+|Where\s+|Among\s+|Identify|Of\s+the|With\s+reference|With\s+regard|Consider|Regarding|As\s+per|According\s+to)/i,
  ];

  const isNewLine = (line, isFirst) => isFirst || NEW_LINE_RE.some(r => r.test(line));

  const result = [];
  let cur = '';
  for (let i = 0; i < lines.length; i++) {
    if (isNewLine(lines[i], i === 0)) {
      if (cur) result.push(cur.replace(/\s{2,}/g, ' ').trim());
      cur = lines[i];
    } else {
      cur = (cur + ' ' + lines[i]).replace(/\s{2,}/g, ' ');
    }
  }
  if (cur) result.push(cur.replace(/\s{2,}/g, ' ').trim());
  return result;
}

function buildOutput(questions, answers, explanations) {
  const nums = Object.keys(questions).map(Number).sort((a, b) => a - b);
  const out = [];
  let matched = 0, noAns = 0, noExpl = 0;

  for (const num of nums) {
    const q = questions[num];
    const ansLetter = answers[num];
    const expl = explanations[num] || '';

    if (!ansLetter) noAns++;
    if (!expl) noExpl++;
    if (ansLetter && expl) matched++;

    // Question body
    const bodyLines = smartJoinBodyLines(q.bodyLines);
    out.push(`Q${num}. ${bodyLines[0] || ''}`);
    for (let j = 1; j < bodyLines.length; j++) out.push(bodyLines[j]);

    // Options
    out.push('😂');
    for (const lt of ['a', 'b', 'c', 'd']) {
      const opt = q.options.find(o => o.letter === lt);
      if (!opt) continue;
      const optText = opt.text.replace(/\s{2,}/g, ' ').trim();
      const mark = (ansLetter && opt.letter === ansLetter) ? ' ✅' : '';
      out.push(optText + mark);
    }

    // Explanation
    out.push(expl ? `Ex: ${expl}` : `Ex: [Explanation not found for Q${num}]`);
    out.push('');
  }

  return {
    text: out.join('\n'),
    total: nums.length,
    matched,
    noAns,
    noExpl,
  };
}

module.exports = { buildOutput };
