const express = require('express');
const router = express.Router();

// 内存存储收藏数据
let favorites = [
  { id: 1, userId: 1, type: 'job', targetId: 'mock_1', title: 'Frontend Developer', subtitle: 'Google', createdAt: '2026-01-04' },
  { id: 2, userId: 1, type: 'experience', targetId: '1', title: '字节跳动产品经理一面经验分享', subtitle: '字节跳动', createdAt: '2026-01-05' },
  { id: 3, userId: 1, type: 'company', targetId: '1', title: '字节跳动', subtitle: '互联网 · AI', createdAt: '2026-01-06' }
];

let nextId = 4;

// 获取用户收藏列表
router.get('/', (req, res) => {
  const { userId = 1, type } = req.query;
  let result = favorites.filter(f => f.userId === parseInt(userId));

  if (type) {
    result = result.filter(f => f.type === type);
  }

  result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ code: 0, data: result });
});

// 添加收藏
router.post('/', (req, res) => {
  const { userId = 1, type, targetId, title, subtitle } = req.body;

  if (!type || !targetId) {
    return res.status(400).json({ code: -1, message: '参数不完整' });
  }

  // 检查是否已收藏
  const exists = favorites.find(f => f.userId === userId && f.type === type && f.targetId === String(targetId));
  if (exists) {
    return res.json({ code: 0, message: '已收藏', data: exists });
  }

  const newFav = {
    id: nextId++,
    userId,
    type,
    targetId: String(targetId),
    title: title || '',
    subtitle: subtitle || '',
    createdAt: new Date().toISOString().split('T')[0]
  };

  favorites.push(newFav);
  res.json({ code: 0, message: '收藏成功', data: newFav });
});

// 取消收藏
router.delete('/', (req, res) => {
  const { userId = 1, type, targetId } = req.body;

  const index = favorites.findIndex(f => f.userId === parseInt(userId) && f.type === type && f.targetId === String(targetId));
  if (index === -1) {
    return res.json({ code: 0, message: '未收藏' });
  }

  favorites.splice(index, 1);
  res.json({ code: 0, message: '取消收藏成功' });
});

// 检查是否已收藏
router.get('/check', (req, res) => {
  const { userId = 1, type, targetId } = req.query;
  const exists = favorites.find(f => f.userId === parseInt(userId) && f.type === type && f.targetId === String(targetId));
  res.json({ code: 0, data: { isFavorited: !!exists } });
});

module.exports = router;
