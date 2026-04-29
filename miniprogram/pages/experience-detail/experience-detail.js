// pages/experience-detail/experience-detail.js
const api = require('../../utils/api.js');
const favUtil = require('../../utils/favorites.js');

Page({
  data: {
    expId: null,
    experience: {},
    hasRichContent: false,
    isCollected: false,
    isLiked: false,
    isFollowed: false,
    commentText: '',
    replyTo: null,
    comments: [],
    commentsLoading: false,
    // 当前登录用户 id（用于判断是否可删自己的评论）
    myUserId: null,
    saveLoading: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ expId: options.id });
      this._loadMyUserId();
      this.loadExperienceDetail();
      this.loadComments();
    }
  },

  _loadMyUserId() {
    try {
      const profile = wx.getStorageSync('userProfile');
      if (profile && profile.id) this.setData({ myUserId: profile.id });
    } catch (e) {}
  },

  // ─── 加载面经详情 ────────────────────────────────────────────────────────
  loadExperienceDetail() {
    // 先检查AI临时面经（来自公司详情页）
    if (this.data.expId === 'aiTemp') {
      const tempExp = wx.getStorageSync('tempExpDetail');
      if (tempExp) {
        wx.removeStorageSync('tempExpDetail');
        const contentText = tempExp.content || '';
        const richContent = [{ type: 'text', content: contentText }];
        if (tempExp.tips) {
          richContent.push({ type: 'heading', content: '给后来人的建议' });
          richContent.push({ type: 'quote', content: tempExp.tips });
        }
        const exp = {
          id: tempExp.id,
          userName: 'AI面经助手',
          userAvatar: '/images/default-avatar.png',
          company: '', position: '',
          type: tempExp.type || '面试',
          round: tempExp.round || '',
          title: tempExp.title,
          richContent: richContent,
          content: contentText,
          tags: tempExp.tags || [],
          likesCount: 0, commentsCount: 0,
          createdAt: tempExp.createdAt || new Date().toISOString().slice(0, 10)
        };
        this.setData({ experience: exp, hasRichContent: true });
        wx.setNavigationBarTitle({ title: exp.title.substring(0, 10) + '...' });
        return;
      }
    }

    // 检查用户本地发布的面经
    const userPosts = wx.getStorageSync('myExperiencePosts') || [];
    const userPost = userPosts.find(p => String(p.id) === String(this.data.expId));
    if (userPost) {
      const exp = {
        id: userPost.id,
        userName: userPost.author || '我',
        userAvatar: userPost.avatar || '/images/default-avatar.png',
        company: userPost.company || '', position: '',
        type: userPost.type || '经验', round: '',
        title: userPost.title,
        richContent: [{ type: 'text', content: userPost.content || userPost.summary || '' }],
        content: userPost.content || userPost.summary || '',
        tags: userPost.tags || [],
        likesCount: userPost.likes || 0, commentsCount: 0,
        createdAt: userPost.date || ''
      };
      this.setData({ experience: exp, hasRichContent: true });
      wx.setNavigationBarTitle({ title: exp.title.substring(0, 10) + '...' });
      this._loadLikeCollectState(userPost.id);
      return;
    }

    // 先用 Mock 快速渲染，再尝试从后端拉取
    this._loadMockExperience();
    // 尝试从后端加载（数字 id 才请求）
    const numId = parseInt(this.data.expId);
    if (numId && numId > 0) {
      api.getExperienceDetail(numId).then(res => {
        if (res && res.code === 0 && res.data) {
          const e = res.data;
          const richContent = e.richContent ||
            [{ type: 'text', content: e.content || '' }];
          const exp = {
            id: e.id,
            userName: e.userName || e.user_name || '匿名用户',
            userAvatar: e.userAvatar || e.user_avatar || '/images/default-avatar.png',
            company: e.company || '', position: e.position || '',
            type: e.type || '面试', round: e.round || '',
            title: e.title,
            richContent: richContent,
            content: e.content || '',
            tags: e.tags || [],
            likesCount: e.likesCount || e.likes_count || 0,
            commentsCount: e.commentsCount || e.comments_count || 0,
            createdAt: e.createdAt || e.created_at || ''
          };
          this.setData({ experience: exp, hasRichContent: true });
        }
      }).catch(() => {});
    }
    this._loadLikeCollectState(this.data.expId);
  },

  // 加载点赞/收藏持久化状态
  _loadLikeCollectState(expId) {
    const isCollected = favUtil.isFavorited('experience', String(expId));
    this.setData({ isCollected });
    // 点赞状态通过 experience_likes 表，评论列表加载后已知；面经本身的点赞
    // 使用 Storage 做前端本地记录（后端通过 token 校验，Storage 防重复 UI）
    try {
      const liked = wx.getStorageSync('likedExperiences') || {};
      this.setData({ isLiked: !!liked[String(expId)] });
    } catch (e) {}
  },

  _loadMockExperience() {
    const mockExperiences = {
      '1': {
        id: 1, userName: '海归小王', userAvatar: '/images/default-avatar.png',
        company: '字节跳动', position: '产品经理', type: '面试', round: '一面',
        title: '字节跳动产品经理一面经验分享',
        richContent: [
          { type: 'text', content: '面试时长约45分钟，主要考察产品思维和逻辑分析能力。' },
          { type: 'heading', content: '第一部分：自我介绍（5分钟）' },
          { type: 'text', content: '面试官让我用3分钟介绍自己的背景和项目经历。建议大家提前准备好不同时长版本的自我介绍。' },
          { type: 'heading', content: '第二部分：产品分析（20分钟）' },
          { type: 'text', content: '1. 请分析抖音的推荐算法原理\n2. 如何提升短视频的完播率？\n3. 设计一个新功能提升用户留存' },
          { type: 'quote', content: '面试官特别强调：产品经理要有数据思维，回答时尽量带上量化指标。' },
          { type: 'heading', content: '第三部分：行为面试（15分钟）' },
          { type: 'text', content: '1. 描述一个你主导的项目经历（STAR法则）\n2. 团队协作中遇到冲突如何解决' },
          { type: 'code', content: 'STAR法则：\nS - Situation（情境）\nT - Task（任务）\nA - Action（行动）\nR - Result（结果）' },
          { type: 'text', content: '总结：整体难度中等，面试官很友好。建议提前了解字节的产品矩阵和商业模式。' }
        ],
        content: '面试时长约45分钟，主要考察产品思维和逻辑分析能力。',
        tags: ['产品经理', '一面', '字节跳动'], likesCount: 234, commentsCount: 12, createdAt: '2026-01-04'
      },
      '2': {
        id: 2, userName: '求职达人', userAvatar: '/images/default-avatar.png',
        company: '腾讯', position: '前端开发', type: '笔试', round: '',
        title: '腾讯前端开发笔试真题汇总',
        richContent: [
          { type: 'text', content: '腾讯前端笔试主要考察以下几大方向：' },
          { type: 'heading', content: '1. JavaScript基础' },
          { type: 'text', content: '闭包、原型链、事件循环是必考点。' },
          { type: 'code', content: '// 经典闭包题\nfor (var i = 0; i < 5; i++) {\n  setTimeout(function() {\n    console.log(i); // 输出什么？\n  }, 1000);\n}' },
          { type: 'heading', content: '2. CSS布局' },
          { type: 'text', content: 'Flex、Grid 布局是重点，需要掌握居中、等分、响应式等常见场景。' },
          { type: 'heading', content: '3. 算法题' },
          { type: 'text', content: '2道中等难度，通常是数组/字符串/链表相关。' },
          { type: 'heading', content: '4. 网络协议' },
          { type: 'text', content: 'HTTP/HTTPS、TCP三次握手四次挥手是基础。' }
        ],
        content: '腾讯前端笔试主要考察：\n1. JavaScript基础（闭包、原型链、事件循环）\n2. CSS布局（Flex、Grid）\n3. 算法题（2道中等难度）\n4. 网络协议（HTTP/HTTPS、TCP）',
        tags: ['前端', '笔试', '腾讯'], likesCount: 156, commentsCount: 8, createdAt: '2026-01-02'
      },
      '3': {
        id: 3, userName: 'CS留学僧', userAvatar: '/images/default-avatar.png',
        company: 'Google', position: 'Software Engineer', type: '面试', round: 'Phone Screen',
        title: 'Google SWE Phone Screen 面试全记录',
        richContent: [
          { type: 'text', content: '总时长45分钟，全英文面试。面试官是一位Senior Engineer，非常友善。' },
          { type: 'heading', content: 'Part 1: Brief Introduction (5 min)' },
          { type: 'text', content: '简单介绍背景，面试官问了为什么想来Google，以及对哪个产品领域感兴趣。' },
          { type: 'heading', content: 'Part 2: Coding (35 min)' },
          { type: 'text', content: '两道算法题：\n1. 给定一个数组，找出所有和为target的pair（双指针/HashMap）\n2. 设计一个LRU Cache（需要写完整代码）' },
          { type: 'code', content: '// LRU Cache 核心思路\nclass LRUCache {\n  constructor(capacity) {\n    this.cap = capacity;\n    this.map = new Map();\n  }\n  get(key) {\n    if (!this.map.has(key)) return -1;\n    const val = this.map.get(key);\n    this.map.delete(key);\n    this.map.set(key, val);\n    return val;\n  }\n}' },
          { type: 'quote', content: 'Google面试注重思考过程，一定要边想边说（Think out loud），沟通比最终答案更重要。' },
          { type: 'heading', content: 'Part 3: Q&A (5 min)' },
          { type: 'text', content: '问了团队文化、work-life balance、new grad的成长路径等。建议准备3-5个有深度的问题。' },
          { type: 'text', content: '结果：一周后收到下一轮Virtual Onsite通知。准备建议：LeetCode Medium难度为主，重点刷Array/String/Tree/Graph。' }
        ],
        content: 'Google SWE Phone Screen全记录。45分钟全英文，2道算法题。注重Think out loud。',
        tags: ['Google', 'SWE', '海外面试', '算法'], likesCount: 512, commentsCount: 35, createdAt: '2026-01-10'
      },
      '4': {
        id: 4, userName: '金融海归', userAvatar: '/images/default-avatar.png',
        company: '高盛', position: '量化分析师', type: '面试', round: '终面',
        title: '高盛量化分析师终面：概率题+行为面',
        richContent: [
          { type: 'text', content: '高盛终面分为两轮，每轮30分钟，共1小时。一轮技术+一轮行为。' },
          { type: 'heading', content: '技术面（30分钟）' },
          { type: 'text', content: '主要考概率统计和编程：\n1. 扔硬币直到连续出现两次正面，期望次数是多少？\n2. 给定一组股票价格，找到最大收益的买卖时机\n3. 解释Black-Scholes模型的假设条件' },
          { type: 'code', content: '# 最大收益\ndef max_profit(prices):\n    min_price = float("inf")\n    max_profit = 0\n    for price in prices:\n        min_price = min(min_price, price)\n        max_profit = max(max_profit, price - min_price)\n    return max_profit' },
          { type: 'heading', content: '行为面（30分钟）' },
          { type: 'text', content: '1. Why Goldman Sachs?\n2. 描述一次你在压力下做出关键决定的经历\n3. 如果你的分析结果和上级的判断冲突，你会怎么做？\n4. 你如何看待AI对金融行业的影响？' },
          { type: 'quote', content: '高盛非常看重leadership和teamwork，每个行为题都要准备具体案例。' },
          { type: 'text', content: '总结：技术面难度中等偏上，概率题需要清晰的推导过程。行为面是决胜关键，准备5-6个高质量STAR案例。' }
        ],
        content: '高盛量化分析师终面记录。技术面考概率统计+编程，行为面考leadership和teamwork。',
        tags: ['量化', '终面', '高盛', '金融'], likesCount: 189, commentsCount: 15, createdAt: '2026-01-08'
      },
      '5': {
        id: 5, userName: '运营小姐姐', userAvatar: '/images/default-avatar.png',
        company: '阿里巴巴', position: '国际运营', type: '面试', round: '二面',
        title: '阿里国际运营二面：案例分析+英文presentation',
        richContent: [
          { type: 'text', content: '阿里国际运营二面比较特别，需要现场做英文presentation，总时长约1小时。' },
          { type: 'heading', content: '环节一：案例分析（30分钟）' },
          { type: 'text', content: '给了一份东南亚市场的数据报告，要求：\n1. 分析Lazada在印尼市场的用户增长瓶颈\n2. 提出3个可落地的运营方案\n3. 预估每个方案的ROI' },
          { type: 'quote', content: '面试官提示：不要只看数据表面，要结合当地文化和消费习惯分析。' },
          { type: 'heading', content: '环节二：英文Presentation（15分钟）' },
          { type: 'text', content: '用英文汇报你的分析结果和方案。面试官全程英文提问。口语流利度和逻辑清晰度都很重要。' },
          { type: 'heading', content: '环节三：追问（15分钟）' },
          { type: 'text', content: '面试官深挖了方案的执行细节，包括预算分配、KPI设定、风险预案等。还问了对跨境电商行业趋势的看法。' },
          { type: 'text', content: '建议：提前了解阿里国际化业务（Lazada/AliExpress/Trendyol），准备好英文自我介绍和行业分析框架。' }
        ],
        content: '阿里国际运营二面：案例分析+英文presentation。重视跨文化理解和数据分析能力。',
        tags: ['运营', '二面', '阿里巴巴', '国际化'], likesCount: 267, commentsCount: 20, createdAt: '2026-01-12'
      },
      '6': {
        id: 6, userName: 'DataSciGuy', userAvatar: '/images/default-avatar.png',
        company: 'Meta', position: 'Data Scientist', type: '面试', round: 'Virtual Onsite',
        title: 'Meta Data Scientist Virtual Onsite 四轮面试详解',
        richContent: [
          { type: 'text', content: '2026年1月参加的Meta DS Virtual Onsite，共4轮，每轮45分钟，半天完成。' },
          { type: 'heading', content: 'Round 1: Product Sense' },
          { type: 'text', content: '如何衡量Instagram Reels的成功？设计一套完整的指标体系。\n面试官追问：如果短期DAU增长但用户停留时长下降，你怎么解读？' },
          { type: 'heading', content: 'Round 2: SQL & Analytics' },
          { type: 'text', content: '3道SQL题，难度递增：\n1. 基础JOIN查询用户活跃度\n2. 窗口函数计算7日留存率\n3. 复杂子查询分析A/B实验结果' },
          { type: 'code', content: '-- 7日留存率\nSELECT \n  signup_date,\n  COUNT(DISTINCT CASE WHEN datediff(activity_date, signup_date) = 7 \n    THEN user_id END) * 1.0 / COUNT(DISTINCT user_id) AS retention_7d\nFROM user_activity\nGROUP BY signup_date;' },
          { type: 'heading', content: 'Round 3: Statistics & Experimentation' },
          { type: 'text', content: '1. A/B测试中如何确定样本量？\n2. 什么时候用Bootstrap？\n3. 实验指标有Novelty Effect怎么处理？' },
          { type: 'heading', content: 'Round 4: Behavioral (Jedi)' },
          { type: 'text', content: 'Meta文化五大核心价值观相关问题。重点考察Move Fast和Be Open。' },
          { type: 'text', content: '结果：2周后收到offer。建议刷Stratascratch和Leetcode SQL，准备product case用AARRR/HEART框架。' }
        ],
        content: 'Meta DS Virtual Onsite四轮面试：Product Sense + SQL + Statistics + Behavioral。2周后拿到offer。',
        tags: ['Data Science', 'Meta', '海外面试', 'SQL'], likesCount: 428, commentsCount: 42, createdAt: '2026-01-15'
      }
    };
    const exp = mockExperiences[this.data.expId] || mockExperiences['1'];
    this.setData({ experience: exp, hasRichContent: true });
    wx.setNavigationBarTitle({ title: exp.title.substring(0, 10) + '...' });
  },

  // 预览图片
  previewImage(e) {
    const url = e.currentTarget.dataset.url;
    const images = (this.data.experience.richContent || [])
      .filter(b => b.type === 'image').map(b => b.url);
    wx.previewImage({ current: url, urls: images });
  },

  // ─── 评论 ────────────────────────────────────────────────────────────────
  loadComments() {
    this.setData({ commentsLoading: true });
    api.getExperienceComments(this.data.expId).then((res) => {
      const comments = ((res && res.data) || []).map((item) => ({
        ...item,
        // isLiked 已由后端基于登录状态返回，若未登录默认 false
        isLiked: !!item.isLiked,
        replies: item.replies || []
      }));
      this.setData({ comments, commentsLoading: false });
    }).catch(() => {
      this.setData({ commentsLoading: false });
      wx.showToast({ title: '评论加载失败', icon: 'none' });
    });
  },

  // 评论输入
  onCommentInput(e) {
    this.setData({ commentText: e.detail.value });
  },

  // 点击回复
  tapReply(e) {
    this.setData({ replyTo: e.currentTarget.dataset.comment, commentText: '' });
  },

  // 取消回复
  cancelReply() {
    this.setData({ replyTo: null });
  },

  // 发送评论/回复
  sendComment() {
    const text = this.data.commentText.trim();
    if (!text) {
      wx.showToast({ title: '请输入评论内容', icon: 'none' });
      return;
    }

    if (this.data.replyTo) {
      api.replyExperienceComment(this.data.replyTo.id, text).then((res) => {
        const comments = this.data.comments;
        const target = comments.find(c => c.id === this.data.replyTo.id);
        if (target) {
          target.replies = target.replies || [];
          target.replies.push({
            id: res.data.id,
            userName: res.data.userName,
            content: res.data.content,
            createdAt: res.data.createdAt
          });
        }
        this.setData({ comments, commentText: '', replyTo: null });
        wx.showToast({ title: '回复成功', icon: 'success' });
      }).catch(() => {
        wx.showToast({ title: '回复失败，请先登录', icon: 'none' });
      });
    } else {
      api.createExperienceComment({
        experienceId: this.data.expId,
        content: text
      }).then((res) => {
        const newComment = {
          ...res.data,
          isLiked: false,
          replies: []
        };
        const comments = [newComment, ...this.data.comments];
        this.setData({
          comments,
          commentText: '',
          'experience.commentsCount': this.data.experience.commentsCount + 1
        });
        wx.showToast({ title: '评论成功', icon: 'success' });
      }).catch((err) => {
        wx.showToast({ title: err.message || '评论失败，请先登录', icon: 'none' });
      });
    }
  },

  // 评论点赞（切换，后端防重复）
  likeComment(e) {
    const index = e.currentTarget.dataset.index;
    const comments = this.data.comments;
    const comment = comments[index];
    if (!comment) return;

    api.likeExperienceComment(comment.id).then((res) => {
      comment.likesCount = res.data.likesCount;
      comment.isLiked = res.data.isLiked;
      this.setData({ comments });
    }).catch(() => {
      wx.showToast({ title: '请先登录', icon: 'none' });
    });
  },

  // 删除自己的评论
  deleteComment(e) {
    const index = e.currentTarget.dataset.index;
    const comment = this.data.comments[index];
    if (!comment) return;
    wx.showModal({
      title: '删除评论',
      content: '确定要删除这条评论吗？',
      success: (modalRes) => {
        if (!modalRes.confirm) return;
        api.deleteExperienceComment(comment.id).then(() => {
          const comments = this.data.comments.filter((_, i) => i !== index);
          this.setData({
            comments,
            'experience.commentsCount': Math.max(0, this.data.experience.commentsCount - 1)
          });
          wx.showToast({ title: '已删除', icon: 'success' });
        }).catch(() => {
          wx.showToast({ title: '删除失败', icon: 'none' });
        });
      }
    });
  },

  // ─── 面经互动 ─────────────────────────────────────────────────────────────
  // 点赞面经（持久化到后端）
  likeExperience() {
    const expId = this.data.expId;
    const numId = parseInt(expId);
    if (!numId) {
      // Mock/本地面经：仅本地切换
      this.setData({ isLiked: !this.data.isLiked });
      return;
    }
    api.likeExperience(numId).then((res) => {
      const isLiked = res.data.isLiked;
      const likesCount = res.data.likesCount;
      this.setData({ isLiked, 'experience.likesCount': likesCount });
      // 同步到本地 Storage，下次进入页面能还原状态
      try {
        const liked = wx.getStorageSync('likedExperiences') || {};
        if (isLiked) liked[String(expId)] = 1;
        else delete liked[String(expId)];
        wx.setStorageSync('likedExperiences', liked);
      } catch (e) {}
      wx.showToast({ title: isLiked ? '点赞成功' : '已取消', icon: 'none' });
    }).catch(() => {
      // 未登录时仍给视觉反馈
      this.setData({ isLiked: !this.data.isLiked });
      wx.showToast({ title: '请先登录', icon: 'none' });
    });
  },

  // 收藏面经（持久化到 favorites + 后端）
  collectExperience() {
    const exp = this.data.experience;
    const item = {
      targetId: String(exp.id),
      title: exp.title,
      subtitle: exp.company + (exp.type ? ' · ' + exp.type : '')
    };
    const nowCollected = favUtil.toggle('experience', item);
    this.setData({ isCollected: nowCollected });
    wx.showToast({ title: nowCollected ? '收藏成功' : '已取消收藏', icon: 'none' });
  },

  // 关注
  toggleFollow() {
    this.setData({ isFollowed: !this.data.isFollowed });
    wx.showToast({ title: this.data.isFollowed ? '已关注' : '已取消关注', icon: 'none' });
  },

  // ─── AI 面试 / 分享 ───────────────────────────────────────────────────────
  startAiInterview() {
    const title = this.data.experience.title;
    wx.navigateTo({
      url: `/pages/interview-dialog/interview-dialog?autoQuestion=${encodeURIComponent(title)}`
    });
  },

  onShareAppMessage() {
    return {
      title: this.data.experience.title,
      path: `/pages/experience-detail/experience-detail?id=${this.data.expId}`
    };
  },

  // ─── 保存为图片 ───────────────────────────────────────────────────────────
  saveAsImage() {
    if (this.data.saveLoading) return;
    this.setData({ saveLoading: true });
    wx.showLoading({ title: '生成中...' });

    const exp = this.data.experience;
    const query = wx.createSelectorQuery();
    query.select('#exp-save-canvas').fields({ node: true, size: true });
    query.exec((res) => {
      if (!res || !res[0] || !res[0].node) {
        wx.hideLoading();
        this.setData({ saveLoading: false });
        wx.showToast({ title: '生成失败', icon: 'none' });
        return;
      }

      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const W = 750, H = 1050;
      const dpr = (wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio) || 2;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.scale(dpr, dpr);

      // Background
      ctx.fillStyle = '#F8FAFF';
      ctx.fillRect(0, 0, W, H);

      // Top gradient header
      const grad = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, '#4F46E5');
      grad.addColorStop(1, '#7C3AED');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, 110);

      // App name
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '24px -apple-system, PingFang SC, sans-serif';
      ctx.fillText('CareerAO · 面经分享', 40, 44);

      // Type tag
      const typeStr = (exp.type || '面经') + (exp.round ? ' · ' + exp.round : '');
      ctx.font = '22px -apple-system, PingFang SC, sans-serif';
      const tagW = ctx.measureText(typeStr).width + 28;
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      this._fillRoundRect(ctx, W - tagW - 40, 20, tagW, 38, 10);
      ctx.fillStyle = '#fff';
      ctx.fillText(typeStr, W - tagW - 26, 44);

      // Date
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '20px -apple-system, PingFang SC, sans-serif';
      ctx.fillText(exp.createdAt || '', 40, 86);

      // Title
      ctx.fillStyle = '#1a1a2e';
      ctx.font = 'bold 36px -apple-system, PingFang SC, sans-serif';
      const titleLines = this._drawWrappedTextOnCanvas(ctx, exp.title || '面经分享', 40, 160, W - 80, 48, 3);
      const afterTitle = 160 + titleLines * 48;

      // Company + position meta
      const metaText = [exp.company, exp.position].filter(Boolean).join(' · ');
      if (metaText) {
        ctx.fillStyle = '#6B7280';
        ctx.font = '26px -apple-system, PingFang SC, sans-serif';
        ctx.fillText(metaText, 40, afterTitle + 24);
      }

      // Divider
      const divY = afterTitle + (metaText ? 54 : 24);
      ctx.strokeStyle = '#E5E7EB';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(40, divY);
      ctx.lineTo(W - 40, divY);
      ctx.stroke();

      // Content snippet
      const content = (exp.content || '').replace(/\n/g, ' ');
      const snippet = content.length > 360 ? content.substring(0, 360) + '...' : content;
      ctx.fillStyle = '#374151';
      ctx.font = '26px -apple-system, PingFang SC, sans-serif';
      const contentLines = this._drawWrappedTextOnCanvas(ctx, snippet, 40, divY + 40, W - 80, 38, 12);

      // Tags
      const tags = (exp.tags || []).slice(0, 5);
      if (tags.length > 0) {
        const tagRowY = Math.min(divY + 40 + contentLines * 38 + 20, H - 130);
        let tagX = 40;
        ctx.font = '22px -apple-system, PingFang SC, sans-serif';
        tags.forEach(tag => {
          const tw = ctx.measureText('# ' + tag).width + 24;
          if (tagX + tw > W - 40) return;
          ctx.fillStyle = '#EEF2FF';
          this._fillRoundRect(ctx, tagX, tagRowY, tw, 36, 8);
          ctx.fillStyle = '#4F46E5';
          ctx.fillText('# ' + tag, tagX + 12, tagRowY + 24);
          tagX += tw + 10;
        });
      }

      // Bottom bar
      ctx.fillStyle = '#F3F4F6';
      ctx.fillRect(0, H - 64, W, 64);
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '22px -apple-system, PingFang SC, sans-serif';
      ctx.fillText('留学生求职助手 · CareerAO', 40, H - 22);
      const likesTxt = '♥ ' + (exp.likesCount || 0) + '  ✎ ' + (exp.commentsCount || 0);
      ctx.fillText(likesTxt, W - 40 - ctx.measureText(likesTxt).width, H - 22);

      // Export
      wx.canvasToTempFilePath({
        canvas,
        success: (fileRes) => {
          wx.hideLoading();
          wx.saveImageToPhotosAlbum({
            filePath: fileRes.tempFilePath,
            success: () => {
              this.setData({ saveLoading: false });
              wx.showToast({ title: '已保存到相册', icon: 'success' });
            },
            fail: (err) => {
              this.setData({ saveLoading: false });
              if (err.errMsg && err.errMsg.includes('auth')) {
                wx.showModal({ title: '需要相册权限', content: '请在设置中开启相册访问权限', showCancel: false });
              } else {
                wx.showToast({ title: '保存失败', icon: 'none' });
              }
            }
          });
        },
        fail: () => {
          wx.hideLoading();
          this.setData({ saveLoading: false });
          wx.showToast({ title: '生成图片失败', icon: 'none' });
        }
      }, this);
    });
  },

  _fillRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
    ctx.fill();
  },

  _drawWrappedTextOnCanvas(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    if (!text) return 0;
    const chars = text.split('');
    let line = '';
    let lineCount = 0;
    let curY = y;
    for (let i = 0; i < chars.length; i++) {
      const testLine = line + chars[i];
      if (ctx.measureText(testLine).width > maxWidth) {
        if (lineCount >= maxLines - 1) {
          ctx.fillText(line + (i < chars.length - 1 ? '...' : ''), x, curY);
          lineCount++;
          return lineCount;
        }
        ctx.fillText(line, x, curY);
        line = chars[i];
        curY += lineHeight;
        lineCount++;
      } else {
        line = testLine;
      }
    }
    if (line) {
      ctx.fillText(line, x, curY);
      lineCount++;
    }
    return lineCount;
  },

  onAvatarError() {
    this.setData({ 'experience.userAvatar': '/images/default-avatar.png' });
  },

  onCmtAvatarError(e) {
    const idx = e.currentTarget.dataset.index;
    this.setData({ [`comments[${idx}].userAvatar`]: '/images/default-avatar.png' });
  }
});
