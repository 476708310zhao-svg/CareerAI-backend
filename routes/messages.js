const express = require('express');
const router = express.Router();

// 消息数据
let messages = [
  { id: 1, userId: 1, type: 'application', title: '投递状态更新', content: '您投递的「腾讯 - 产品经理」已被HR查看', isRead: false, createdAt: '2026-01-06T10:30:00' },
  { id: 2, userId: 1, type: 'application', title: '面试邀请', content: '恭喜！您已收到「字节跳动 - 前端开发工程师」的面试邀请', isRead: false, createdAt: '2026-01-05T15:00:00' },
  { id: 3, userId: 1, type: 'system', title: '系统通知', content: '您的VIP会员即将到期，续费可享8折优惠', isRead: true, createdAt: '2026-01-04T09:00:00' },
  { id: 4, userId: 1, type: 'interaction', title: '评论回复', content: '留学生小王 回复了你的笔经面经', isRead: true, createdAt: '2026-01-03T14:20:00' },
  { id: 5, userId: 1, type: 'application', title: 'Offer通知', content: '恭喜！您已收到「Google - Software Engineer」的Offer', isRead: false, createdAt: '2026-01-02T16:00:00' }
];

// 获取消息列表
router.get('/', (req, res) => {
  const { userId = 1, type } = req.query;
  let result = messages.filter(m => m.userId === parseInt(userId));

  if (type) {
    result = result.filter(m => m.type === type);
  }

  result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const unreadCount = result.filter(m => !m.isRead).length;

  res.json({ code: 0, data: { list: result, unreadCount } });
});

// 标记消息已读
router.put('/:id/read', (req, res) => {
  const id = parseInt(req.params.id);
  const msg = messages.find(m => m.id === id);

  if (!msg) {
    return res.status(404).json({ code: -1, message: '消息不存在' });
  }

  msg.isRead = true;
  res.json({ code: 0, message: '已标记为已读' });
});

// 全部标记已读
router.put('/read-all', (req, res) => {
  const { userId = 1 } = req.body;
  messages.forEach(m => {
    if (m.userId === parseInt(userId)) m.isRead = true;
  });
  res.json({ code: 0, message: '全部已读' });
});

// 获取未读数量
router.get('/unread-count', (req, res) => {
  const { userId = 1 } = req.query;
  const count = messages.filter(m => m.userId === parseInt(userId) && !m.isRead).length;
  res.json({ code: 0, data: { count } });
});

module.exports = router;
