'use strict';

const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { consumeDailyLimit } = require('../utils/aiQuota');
const { aiLimiter } = require('../middleware/rateLimit');
const aiRuntime = require('../services/v4AiRuntime');
const conversations = require('../services/aiConversations');

// Read-only fail-fast preflight. Versioned changes still run only through db/migrate.js.
conversations.assertSchema();

const router = express.Router();
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use(authMiddleware);

function sendError(res, error) {
  const candidate = Number(error.status);
  const status = Number.isInteger(candidate) && candidate >= 400 && candidate <= 499 ? candidate : 500;
  if (status >= 500) console.error('[ai/conversations]', error);
  return res.status(status).json({
    code: -1,
    message: status >= 500 ? 'AI 会话暂时不可用' : error.message,
  });
}

function finishBestEffort(turnId, status, answer, errorCode) {
  if (!turnId) return null;
  try {
    return conversations.finish(turnId, status, answer, errorCode);
  } catch (error) {
    console.error('[ai/conversations] unable to finalize turn', { turnId, status, error });
    return null;
  }
}

router.get('/', (req, res) => {
  try {
    return res.json({
      code: 0,
      data: conversations.list(req.user.userId, req.query.before, req.query.applicationId),
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/', aiLimiter, (req, res) => {
  try {
    const data = conversations.create(req.user.userId, req.body || {});
    return res.status(data.resumed ? 200 : 201).json({ code: 0, data });
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/:id', (req, res) => {
  try {
    return res.json({ code: 0, data: conversations.detail(req.user.userId, req.params.id, req.query.before) });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/:id/turns', aiLimiter, async (req, res) => {
  let started;
  try {
    started = conversations.begin(
      req.user.userId,
      req.params.id,
      req.body || {},
      () => consumeDailyLimit(req, res, 'assistant')
    );
    if (!started) return undefined;
    if (started.replay) {
      return res.json({
        code: 0,
        data: started.replay,
        replay: true,
        retryWithNewRequestId: started.replay.retryWithNewRequestId === true,
      });
    }

    const systemPrompt = started.messages[0].content;
    const userPrompt = started.messages.slice(1)
      .map(message => `${message.role === 'assistant' ? '导师' : '用户'}：${message.content}`)
      .join('\n');
    const generated = await aiRuntime.generate({
      systemPrompt,
      userPrompt,
      format: 'text',
      timeoutMs: 30000,
      maxTokens: 1800,
      retries: 1,
      fallback: () => '',
    });
    const answer = typeof generated.value === 'string' ? generated.value.trim() : '';
    if (generated.source !== 'live' || generated.degraded || generated.error || !answer) {
      const code = generated.error?.code || (generated.fallbackReason === 'timeout' ? 'AI_TIMEOUT' : 'AI_UNAVAILABLE');
      const turn = finishBestEffort(started.turnId, 'failed', '', code);
      return res.status(code === 'AI_TIMEOUT' ? 504 : 503).json({
        code: -1,
        message: 'AI 暂时不可用，请稍后使用新的请求标识重试',
        data: turn,
      });
    }
    const turn = finishBestEffort(started.turnId, 'completed', answer);
    if (!turn || turn.status !== 'completed') {
      return res.status(503).json({
        code: -1,
        message: 'AI 返回无效，请稍后使用新的请求标识重试',
        data: turn,
      });
    }
    return res.status(201).json({ code: 0, data: turn });
  } catch (error) {
    if (started && started.turnId) {
      finishBestEffort(started.turnId, 'failed', '', error.code || 'AI_UPSTREAM_ERROR');
    }
    return sendError(res, error);
  }
});

router.post('/:id/turns/:turnId/cancel', (req, res) => {
  try {
    return res.json({
      code: 0,
      data: conversations.cancel(req.user.userId, req.params.id, req.params.turnId),
    });
  } catch (error) {
    return sendError(res, error);
  }
});

module.exports = router;
