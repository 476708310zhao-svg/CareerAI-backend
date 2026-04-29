const express = require('express');
const router = express.Router();

// 内存存储评论数据
let comments = [
  { id: 1, experienceId: 1, userId: 1, userName: '留学生小明', userAvatar: 'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=100', content: '分享得非常详细，对准备字节面试很有帮助！', likesCount: 12, createdAt: '2026-01-05', replies: [] },
  { id: 2, experienceId: 1, userId: 2, userName: '海归小王', userAvatar: 'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=100', content: '请问一面大概多长时间？', likesCount: 3, createdAt: '2026-01-06', replies: [
    { id: 101, userId: 1, userName: '留学生小明', content: '大概45分钟左右', createdAt: '2026-01-06' }
  ]},
  { id: 3, experienceId: 2, userId: 3, userName: '求职达人', userAvatar: 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=100', content: '腾讯的面试流程确实比较长，要有耐心', likesCount: 8, createdAt: '2026-01-07', replies: [] }
];

let nextId = 4;
let nextReplyId = 102;

// 获取某篇面经的评论列表
router.get('/:experienceId', (req, res) => {
  const expId = parseInt(req.params.experienceId);
  const expComments = comments.filter(c => c.experienceId === expId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({ code: 0, data: expComments, total: expComments.length });
});

// 发表评论
router.post('/', (req, res) => {
  const { experienceId, content, userId = 1, userName = '匿名用户', userAvatar = '' } = req.body;

  if (!experienceId || !content) {
    return res.status(400).json({ code: -1, message: '参数不完整' });
  }

  const newComment = {
    id: nextId++,
    experienceId: parseInt(experienceId),
    userId,
    userName,
    userAvatar: userAvatar || 'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=100',
    content,
    likesCount: 0,
    createdAt: new Date().toISOString().split('T')[0],
    replies: []
  };

  comments.unshift(newComment);
  res.json({ code: 0, message: '评论成功', data: newComment });
});

// 回复评论
router.post('/:commentId/reply', (req, res) => {
  const commentId = parseInt(req.params.commentId);
  const { content, userId = 1, userName = '匿名用户' } = req.body;

  const comment = comments.find(c => c.id === commentId);
  if (!comment) {
    return res.status(404).json({ code: -1, message: '评论不存在' });
  }

  const reply = {
    id: nextReplyId++,
    userId,
    userName,
    content,
    createdAt: new Date().toISOString().split('T')[0]
  };

  comment.replies.push(reply);
  res.json({ code: 0, message: '回复成功', data: reply });
});

// 评论点赞
router.post('/:commentId/like', (req, res) => {
  const commentId = parseInt(req.params.commentId);
  const comment = comments.find(c => c.id === commentId);

  if (!comment) {
    return res.status(404).json({ code: -1, message: '评论不存在' });
  }

  comment.likesCount += 1;
  res.json({ code: 0, data: { likesCount: comment.likesCount } });
});

module.exports = router;
