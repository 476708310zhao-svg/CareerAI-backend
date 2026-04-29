const router = require('express').Router();
const axios  = require('axios');
const { aiLimiter } = require('../middleware/rateLimit');

const DEEPSEEK_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions';

// ── AI 对话（面试/面经/题库生成） ────────────────
// POST /api/ai/chat
// Body: { messages: [...], temperature: 0.7 }
router.post('/chat', aiLimiter, async (req, res) => {
  const { messages, temperature } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages 不能为空' });
  }

  try {
    const result = await axios.post(
      DEEPSEEK_URL,
      {
        model: 'deepseek-chat',
        messages,
        temperature: temperature ?? 0.7,
        stream: false
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000   // AI 生成最长等 60 秒
      }
    );
    res.json(result.data);
  } catch (err) {
    const status = err.response?.status || 500;
    console.error('[ai/chat]', status, err.message);

    if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
      return res.status(504).json({ error: 'AI响应超时，请重试' });
    }
    if (status === 402) {
      return res.status(402).json({ error: 'DeepSeek余额不足，请充值' });
    }
    res.status(status).json({ error: err.message });
  }
});

module.exports = router;
