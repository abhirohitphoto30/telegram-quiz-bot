const { Telegraf } = require('telegraf');
const axios = require('axios');
const { parseTestPdf } = require('../lib/parseTest');
const { parseSolutionPdf } = require('../lib/parseSolution');
const { buildOutput } = require('../lib/buildOutput');

const bot = new Telegraf(process.env.BOT_TOKEN);

// In-memory state per chat: { step: 'wait_test'|'wait_sol', testBuffer, testName }
const state = new Map();

// ── Download a Telegram file into a Buffer ───────────────────────────────────
async function downloadFile(fileId) {
  const token = process.env.BOT_TOKEN;
  const infoUrl = `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`;
  const { data: info } = await axios.get(infoUrl);
  const filePath = info.result.file_path;
  const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
  const { data } = await axios.get(fileUrl, { responseType: 'arraybuffer' });
  return Buffer.from(data);
}

// ── /start ───────────────────────────────────────────────────────────────────
bot.start(ctx => {
  state.set(ctx.chat.id, { step: 'wait_test' });
  return ctx.reply(
    '👋 Welcome to the *PDF Quiz Converter Bot*!\n\n' +
    'I convert your Test PDF + Solution PDF into a clean formatted `.txt` file.\n\n' +
    '📋 *Step 1:* Send me the *TEST PDF* (question booklet)',
    { parse_mode: 'Markdown' }
  );
});

// ── /reset ───────────────────────────────────────────────────────────────────
bot.command('reset', ctx => {
  state.set(ctx.chat.id, { step: 'wait_test' });
  return ctx.reply('🔄 Reset! Send me the *TEST PDF* to start again.', { parse_mode: 'Markdown' });
});

// ── /help ────────────────────────────────────────────────────────────────────
bot.command('help', ctx => {
  return ctx.reply(
    '*How to use:*\n\n' +
    '1️⃣ Send /start\n' +
    '2️⃣ Upload the *TEST PDF* (questions with options a/b/c/d)\n' +
    '3️⃣ Upload the *SOLUTION PDF* (answer key + explanations)\n' +
    '4️⃣ Receive your formatted `.txt` file ✅\n\n' +
    'Use /reset to start over at any time.',
    { parse_mode: 'Markdown' }
  );
});

// ── Document handler ─────────────────────────────────────────────────────────
bot.on('document', async ctx => {
  const chatId = ctx.chat.id;
  const doc = ctx.message.document;

  // Ensure user has started
  if (!state.has(chatId)) {
    state.set(chatId, { step: 'wait_test' });
    return ctx.reply('Please send /start first to begin.');
  }

  const s = state.get(chatId);

  // Only accept PDFs
  if (!doc.file_name.toLowerCase().endsWith('.pdf') && doc.mime_type !== 'application/pdf') {
    return ctx.reply('⚠️ Please send a *PDF* file.', { parse_mode: 'Markdown' });
  }

  // ── Step 1: Receive TEST PDF ───────────────────────────────────
  if (s.step === 'wait_test') {
    const processing = await ctx.reply('📥 Received TEST PDF. Downloading...');
    try {
      const buffer = await downloadFile(doc.file_id);
      state.set(chatId, { step: 'wait_sol', testBuffer: buffer, testName: doc.file_name });
      await ctx.telegram.editMessageText(
        chatId, processing.message_id, null,
        '✅ TEST PDF saved!\n\n💡 *Step 2:* Now send me the *SOLUTION PDF* (answer key + explanations)',
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      await ctx.telegram.editMessageText(chatId, processing.message_id, null,
        '❌ Failed to download the PDF. Please try again.');
      console.error('Download error:', err.message);
    }
    return;
  }

  // ── Step 2: Receive SOLUTION PDF → process both ────────────────
  if (s.step === 'wait_sol') {
    const processing = await ctx.reply('📥 Received SOLUTION PDF. Processing both files...\n\n⏳ This may take 20–40 seconds, please wait.');
    try {
      // Download solution PDF
      const solBuffer = await downloadFile(doc.file_id);

      // Parse TEST PDF
      await ctx.telegram.editMessageText(chatId, processing.message_id, null,
        '⚙️ Parsing questions from TEST PDF...');
      const questions = await parseTestPdf(s.testBuffer);
      const qCount = Object.keys(questions).length;

      if (qCount === 0) {
        state.set(chatId, { step: 'wait_test' });
        return ctx.telegram.editMessageText(chatId, processing.message_id, null,
          '❌ No questions found in the TEST PDF.\n\nMake sure the TEST PDF has options (a), (b), (c), (d).\n\nSend /start to try again.');
      }

      // Parse SOLUTION PDF
      await ctx.telegram.editMessageText(chatId, processing.message_id, null,
        `✅ Found ${qCount} questions.\n⚙️ Parsing answers and explanations...`);
      const { answers, explanations } = await parseSolutionPdf(solBuffer);

      if (Object.keys(answers).length === 0) {
        state.set(chatId, { step: 'wait_test' });
        return ctx.telegram.editMessageText(chatId, processing.message_id, null,
          '❌ No answer key found in the SOLUTION PDF.\n\nMake sure the SOLUTION PDF has the answer key table.\n\nSend /start to try again.');
      }

      // Build output
      await ctx.telegram.editMessageText(chatId, processing.message_id, null,
        '✅ Answers parsed. Building formatted output...');
      const { text, total, matched, noAns, noExpl } = buildOutput(questions, answers, explanations);

      // Send the .txt file
      const baseName = s.testName.replace(/\.pdf$/i, '');
      const fileName = baseName + '_CONVERTED.txt';
      const fileBuffer = Buffer.from(text, 'utf-8');

      await ctx.telegram.editMessageText(chatId, processing.message_id, null,
        `✅ *Done!*\n\n📊 *Stats:*\n• Total questions: ${total}\n• Matched with explanation: ${matched}\n• Missing answers: ${noAns}\n• Missing explanations: ${noExpl}\n\n📄 Sending your file...`,
        { parse_mode: 'Markdown' }
      );

      await ctx.replyWithDocument(
        { source: fileBuffer, filename: fileName },
        { caption: `✅ Here is your converted file: *${fileName}*`, parse_mode: 'Markdown' }
      );

      // Reset state for next conversion
      state.set(chatId, { step: 'wait_test' });
      await ctx.reply('🔄 Ready for another conversion! Send /start to begin again.');

    } catch (err) {
      console.error('Processing error:', err);
      state.set(chatId, { step: 'wait_test' });
      await ctx.telegram.editMessageText(chatId, processing.message_id, null,
        `❌ An error occurred while processing:\n${err.message}\n\nSend /start to try again.`
      ).catch(() => {});
    }
    return;
  }

  // Default: user sent a file but step is unknown
  return ctx.reply('Please send /start to begin.');
});

// ── Fallback for text messages ───────────────────────────────────────────────
bot.on('message', ctx => {
  const s = state.get(ctx.chat.id);
  const step = s ? s.step : 'wait_test';
  if (step === 'wait_test') {
    return ctx.reply('📋 Please send the *TEST PDF* file (question booklet).', { parse_mode: 'Markdown' });
  }
  if (step === 'wait_sol') {
    return ctx.reply('💡 Please send the *SOLUTION PDF* file (answer key + explanations).', { parse_mode: 'Markdown' });
  }
  return ctx.reply('Send /start to begin.');
});

// ── Vercel serverless handler ────────────────────────────────────────────────
module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      await bot.handleUpdate(req.body);
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Bot error:', err);
      res.status(200).json({ ok: false });
    }
  } else {
    res.status(200).send('Bot is running ✅');
  }
};
