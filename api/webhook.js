const { Telegraf } = require('telegraf');
const axios = require('axios');
const { parseTestPdf } = require('../lib/parseTest');
const { parseSolutionPdf } = require('../lib/parseSolution');
const { buildOutput } = require('../lib/buildOutput');

// Lazy-init bot (avoids issues if BOT_TOKEN not set during cold start)
let bot;
function getBot() {
  if (!bot) {
    bot = new Telegraf(process.env.BOT_TOKEN);
    registerHandlers(bot);
  }
  return bot;
}

// In-memory state per chat
const state = new Map();

// Download Telegram file as Buffer
async function downloadFile(fileId) {
  const token = process.env.BOT_TOKEN;
  const { data: info } = await axios.get(
    `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`
  );
  const filePath = info.result.file_path;
  const { data } = await axios.get(
    `https://api.telegram.org/file/bot${token}/${filePath}`,
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(data);
}

// Edit a message safely (ignore errors)
async function editMsg(ctx, msgId, text, extra = {}) {
  try {
    await ctx.telegram.editMessageText(ctx.chat.id, msgId, null, text, extra);
  } catch (_) {}
}

function registerHandlers(bot) {

  // /start
  bot.start(ctx => {
    state.set(ctx.chat.id, { step: 'wait_test' });
    return ctx.reply(
      '👋 *PDF Quiz Converter Bot*\n\n' +
      'I convert your Test + Solution PDFs into a clean `.txt` file.\n\n' +
      '📋 *Step 1:* Send me the *TEST PDF* (question booklet with a/b/c/d options)',
      { parse_mode: 'Markdown' }
    );
  });

  // /reset
  bot.command('reset', ctx => {
    state.set(ctx.chat.id, { step: 'wait_test' });
    return ctx.reply('🔄 Reset done! Now send me the *TEST PDF*.', { parse_mode: 'Markdown' });
  });

  // /help
  bot.command('help', ctx => {
    return ctx.reply(
      '*How to use:*\n\n' +
      '1️⃣ /start\n' +
      '2️⃣ Upload *TEST PDF* (questions with a/b/c/d)\n' +
      '3️⃣ Upload *SOLUTION PDF* (answer key + explanations)\n' +
      '4️⃣ Get your formatted `.txt` file ✅\n\n' +
      'Use /reset to start over.',
      { parse_mode: 'Markdown' }
    );
  });

  // Document upload handler
  bot.on('document', async ctx => {
    const chatId = ctx.chat.id;
    const doc = ctx.message.document;

    if (!state.has(chatId)) {
      state.set(chatId, { step: 'wait_test' });
      return ctx.reply('Send /start first to begin.');
    }

    const isPdf = doc.file_name?.toLowerCase().endsWith('.pdf') ||
                  doc.mime_type === 'application/pdf';
    if (!isPdf) {
      return ctx.reply('⚠️ Please send a *PDF* file only.', { parse_mode: 'Markdown' });
    }

    const s = state.get(chatId);

    // ── Step 1: TEST PDF ──────────────────────────────────────────
    if (s.step === 'wait_test') {
      const msg = await ctx.reply('📥 Downloading TEST PDF...');
      try {
        const buffer = await downloadFile(doc.file_id);
        state.set(chatId, { step: 'wait_sol', testBuffer: buffer, testName: doc.file_name });
        await editMsg(ctx, msg.message_id,
          '✅ TEST PDF received!\n\n💡 *Step 2:* Now send the *SOLUTION PDF* (answer key + explanations)',
          { parse_mode: 'Markdown' }
        );
      } catch (err) {
        await editMsg(ctx, msg.message_id, '❌ Download failed. Please try again.');
        console.error('Download error (test):', err.message);
      }
      return;
    }

    // ── Step 2: SOLUTION PDF → process both ──────────────────────
    if (s.step === 'wait_sol') {
      const msg = await ctx.reply('📥 Downloading Solution PDF...\n⏳ Processing may take 30-50 seconds, please wait.');
      try {
        const solBuffer = await downloadFile(doc.file_id);

        await editMsg(ctx, msg.message_id, '⚙️ Parsing questions from TEST PDF...');
        const questions = await parseTestPdf(s.testBuffer);
        const qCount = Object.keys(questions).length;

        if (qCount === 0) {
          state.set(chatId, { step: 'wait_test' });
          return editMsg(ctx, msg.message_id,
            '❌ No questions found in TEST PDF.\n\nMake sure it has (a) (b) (c) (d) options.\n\nSend /start to try again.'
          );
        }

        await editMsg(ctx, msg.message_id, `✅ Found ${qCount} questions.\n⚙️ Parsing answers and explanations...`);
        const { answers, explanations } = await parseSolutionPdf(solBuffer);

        if (Object.keys(answers).length === 0) {
          state.set(chatId, { step: 'wait_test' });
          return editMsg(ctx, msg.message_id,
            '❌ No answer key found in Solution PDF.\n\nMake sure it has the answer key table.\n\nSend /start to try again.'
          );
        }

        await editMsg(ctx, msg.message_id, '✅ Building formatted output...');
        const { text, total, matched, noAns, noExpl } = buildOutput(questions, answers, explanations);

        await editMsg(ctx, msg.message_id,
          `✅ *Done!*\n\n📊 *Stats:*\n• Total questions: ${total}\n• Matched with explanation: ${matched}\n• Missing answers: ${noAns}\n• Missing explanations: ${noExpl}\n\n📄 Sending file...`,
          { parse_mode: 'Markdown' }
        );

        const baseName = (s.testName || 'output').replace(/\.pdf$/i, '');
        await ctx.replyWithDocument(
          { source: Buffer.from(text, 'utf-8'), filename: baseName + '_CONVERTED.txt' },
          { caption: `✅ *${baseName}_CONVERTED.txt*`, parse_mode: 'Markdown' }
        );

        state.set(chatId, { step: 'wait_test' });
        await ctx.reply('🔄 Ready for another! Send /start to convert again.');

      } catch (err) {
        console.error('Processing error:', err);
        state.set(chatId, { step: 'wait_test' });
        await editMsg(ctx, msg.message_id,
          `❌ Error: ${err.message}\n\nSend /start to try again.`
        );
      }
      return;
    }

    return ctx.reply('Send /start to begin.');
  });

  // Text message fallback
  bot.on('message', ctx => {
    const s = state.get(ctx.chat.id);
    const step = s?.step || 'none';
    if (step === 'wait_test') return ctx.reply('📋 Please send the *TEST PDF* file.', { parse_mode: 'Markdown' });
    if (step === 'wait_sol') return ctx.reply('💡 Please send the *SOLUTION PDF* file.', { parse_mode: 'Markdown' });
    return ctx.reply('Send /start to begin.');
  });
}

// Vercel serverless entry point
module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      await getBot().handleUpdate(req.body);
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Webhook error:', err);
      res.status(200).json({ ok: false, error: err.message });
    }
  } else {
    res.status(200).send('✅ Bot is running');
  }
};
