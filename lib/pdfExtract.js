const pdfParse = require('pdf-parse');

// Extract text from PDF buffer, returns array of page strings
async function extractPages(buffer) {
  const pages = [];
  await pdfParse(buffer, {
    pagerender: function(pageData) {
      return pageData.getTextContent().then(function(textContent) {
        const items = textContent.items;
        // Sort items by vertical position (top to bottom), then left to right
        const sorted = [...items].sort((a, b) => {
          const ay = Math.round(a.transform[5] / 5) * 5;
          const by = Math.round(b.transform[5] / 5) * 5;
          if (ay !== by) return by - ay; // descending y (top first)
          return a.transform[4] - b.transform[4]; // left to right
        });
        let text = '';
        let lastY = null;
        for (const item of sorted) {
          const y = Math.round(item.transform[5] / 5) * 5;
          if (lastY !== null && Math.abs(y - lastY) > 5) {
            text += '\n';
          } else if (lastY !== null && text.length > 0 && !text.endsWith(' ')) {
            text += ' ';
          }
          text += item.str;
          lastY = y;
        }
        pages.push(text.trim());
        return text;
      });
    }
  });
  return pages;
}

// Simple flat text extraction (fallback)
async function extractFullText(buffer) {
  const data = await pdfParse(buffer);
  return data.text;
}

module.exports = { extractPages, extractFullText };
