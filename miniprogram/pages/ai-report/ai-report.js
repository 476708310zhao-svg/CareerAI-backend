// pages/ai-report/ai-report.js
Page({
  data: {
    report: null,
    loading: true,
    activeTab: 0, // 0: 总览, 1: 问答复盘
    qaBookmarkSet: {} // qid → bool，标记当前报告中已收藏的题目
  },

  onLoad(options) {
    this.loadReportDetail(options.id);
  },

  switchTab(e) {
    const idx = Number(e.currentTarget.dataset.index);
    this.setData({ activeTab: idx });
    if (idx === 0 && this.data.report && this.data.report.dimensions) {
      setTimeout(() => this.drawRadarChart(this.data.report.dimensions), 300);
    }
  },

  loadReportDetail(id) {
    this.setData({ loading: true });

    // 优先按唯一 key 读取对应报告，再兜底 lastAiReport
    let cached = null;
    if (id) cached = wx.getStorageSync('aiReport_' + id);
    if (!cached) cached = wx.getStorageSync('lastAiReport');

    setTimeout(() => {
      if (cached && cached.qaList && cached.qaList.length > 0) {
        // 计算维度颜色和等级
        const dimensions = (cached.dimensions || []).map(d => ({
          ...d,
          color: this.getScoreColor(d.score),
          level: this.getScoreLevel(d.score),
          barWidth: d.score
        }));

        // 计算雷达图数据点（用于Canvas或简单展示）
        const radarData = dimensions.map(d => ({
          name: d.name,
          value: d.score,
          percent: d.score + '%'
        }));

        const sortedDims = [...dimensions].sort((a, b) => a.score - b.score);
        const improveItems = sortedDims.slice(0, 2).map(d => ({ name: d.name, score: d.score, color: d.color }));

        const reportId = cached.id || ('r' + Date.now());
        const qaList = (cached.qaList || []).map((item, i) => ({
          ...item,
          qid: `${reportId}_q${i}`,
          feedbackSegments: this.processHighlights(item.feedback || '')
        }));

        const benchmark = this.buildBenchmark(cached.totalScore, dimensions);
        this.setData({
          loading: false,
          report: {
            ...cached,
            dimensions,
            radarData,
            qaList,
            improveItems,
            benchmark,
            scoreLevel: this.getScoreLevel(cached.totalScore),
            scoreColor: this.getScoreColor(cached.totalScore),
            scoreDesc: this.getScoreDesc(cached.totalScore)
          }
        });
        setTimeout(() => this.drawRadarChart(dimensions), 300);
        this.buildBookmarkSet(qaList);
      } else {
        // 兜底模拟数据
        this.loadMockReport(id);
      }
    }, 600);
  },

  loadMockReport(id) {
    const mockDimensions = [
      { name: '语言表达', score: 82 },
      { name: '内容逻辑', score: 78 },
      { name: '专业知识', score: 90 },
      { name: '应变能力', score: 72 },
      { name: '沟通表达', score: 85 }
    ].map(d => ({
      ...d,
      color: this.getScoreColor(d.score),
      level: this.getScoreLevel(d.score),
      barWidth: d.score
    }));

    const sortedMockDims = [...mockDimensions].sort((a, b) => a.score - b.score);
    const mockImproveItems = sortedMockDims.slice(0, 2).map(d => ({ name: d.name, score: d.score, color: d.color }));

    const mockQaList = [
      {
        q: 'React 的 Fiber 架构是为了解决什么问题？',
        a: '是为了解决大型应用在更新时 JS 线程长时间占用导致页面卡顿的问题...',
        feedback: '回答准确，核心关键词命中，可以进一步提升对调度优先级的描述。',
        score: 95
      },
      {
        q: '如何优化首屏加载速度？',
        a: '可以使用懒加载、CDN、压缩图片...',
        feedback: '回答比较全面，但缺少具体的量化指标描述，建议补充 LCP/FCP 等性能指标。',
        score: 80
      },
      {
        q: '描述一次你在团队中解决冲突的经历',
        a: '在之前的项目中，团队成员对技术选型有分歧...',
        feedback: '运用了STAR法则，但可以更具体地描述结果。需要量化最终产出数据。',
        score: 75
      }
    ].map((item, i) => ({ ...item, qid: `mock_q${i}`, feedbackSegments: this.processHighlights(item.feedback) }));

    const mockBenchmark = this.buildBenchmark(85, mockDimensions);
    this.setData({
      loading: false,
      report: {
        id: id || 'mock',
        role: '前端开发工程师',
        company: 'Google',
        totalScore: 85,
        scoreLevel: this.getScoreLevel(85),
        scoreColor: this.getScoreColor(85),
        scoreDesc: this.getScoreDesc(85),
        dimensions: mockDimensions,
        improveItems: mockImproveItems,
        benchmark: mockBenchmark,
        strengths: '对前端基础掌握扎实，React 原理部分回答清晰有条理，能够结合实际项目经验进行阐述。',
        weaknesses: '系统设计方面略显生疏，对分布式架构和性能优化缺乏深入理解。',
        suggestion: '建议加强大型项目架构设计的学习，多做 System Design 类题目练习。',
        summary: '候选人综合表现良好，技术基础扎实，建议在系统设计方面继续提升。',
        qaList: mockQaList,
        createTime: new Date().toLocaleDateString('zh-CN')
      }
    });
    setTimeout(() => this.drawRadarChart(mockDimensions), 300);
    this.buildBookmarkSet(mockQaList);
  },

  // 初始化当前报告的题目收藏状态
  buildBookmarkSet(qaList) {
    const stored = wx.getStorageSync('bookmarkedQuestions') || [];
    const storedIds = new Set(stored.map(b => b.qid));
    const set = {};
    (qaList || []).forEach(item => { set[item.qid] = storedIds.has(item.qid); });
    this.setData({ qaBookmarkSet: set });
  },

  // 切换题目收藏（加入/移出错题本）
  toggleQaBookmark(e) {
    const { qid, question, answer, feedback, score, source } = e.currentTarget.dataset;
    const set = { ...this.data.qaBookmarkSet };
    let bookmarks = wx.getStorageSync('bookmarkedQuestions') || [];

    if (set[qid]) {
      bookmarks = bookmarks.filter(b => b.qid !== qid);
      set[qid] = false;
      wx.showToast({ title: '已移出错题本', icon: 'none' });
    } else {
      bookmarks.unshift({ qid, question, answer, feedback, score: Number(score) || 0, source: source || '', timestamp: Date.now() });
      set[qid] = true;
      wx.showToast({ title: '已加入错题本', icon: 'success' });
    }

    wx.setStorageSync('bookmarkedQuestions', bookmarks);
    this.setData({ qaBookmarkSet: set });
  },

  // 将 feedback 文本按关键词拆分为高亮片段
  processHighlights(text) {
    const keywords = ['建议', '需要', '可以', '应当', '注意', '缺少', '不足', '加强', '提升', '避免'];
    if (!text) return [{ text: '', hl: false }];
    const segments = [];
    let str = text;
    while (str.length > 0) {
      let minIdx = str.length;
      let matchKw = null;
      for (const kw of keywords) {
        const idx = str.indexOf(kw);
        if (idx !== -1 && idx < minIdx) { minIdx = idx; matchKw = kw; }
      }
      if (!matchKw) { segments.push({ text: str, hl: false }); break; }
      if (minIdx > 0) segments.push({ text: str.slice(0, minIdx), hl: false });
      segments.push({ text: matchKw, hl: true });
      str = str.slice(minIdx + matchKw.length);
    }
    return segments;
  },

  // 构建对标分析数据
  buildBenchmark(totalScore, dimensions) {
    // 行业各维度平均分（模拟数据，可按岗位调整）
    const avgMap = {
      '语言表达': 72, '内容逻辑': 70, '专业知识': 75,
      '应变能力': 68, '沟通表达': 71, '技术深度': 74,
      '项目经验': 73, '英语能力': 66
    };
    const fallbackAvg = 71;

    const dims = (dimensions || []).map(d => {
      const avg = avgMap[d.name] || fallbackAvg;
      const diff = d.score - avg;
      return {
        name: d.name,
        myScore: d.score,
        avgScore: avg,
        diff,
        color: d.color
      };
    });

    const avgScore = Math.round(dims.reduce((s, d) => s + d.avgScore, 0) / (dims.length || 1));

    // 估算百分位
    let percentile = 50;
    const gap = totalScore - avgScore;
    if (gap >= 20) percentile = 95;
    else if (gap >= 15) percentile = 90;
    else if (gap >= 10) percentile = 82;
    else if (gap >= 5)  percentile = 70;
    else if (gap >= 0)  percentile = 55;
    else if (gap >= -5) percentile = 40;
    else if (gap >= -10) percentile = 28;
    else percentile = 15;

    return { dims, avgScore, percentile };
  },

  getScoreColor(score) {
    if (score >= 90) return '#52c41a';
    if (score >= 80) return '#1890ff';
    if (score >= 70) return '#faad14';
    if (score >= 60) return '#fa8c16';
    return '#f5222d';
  },

  getScoreLevel(score) {
    if (score >= 90) return '优秀';
    if (score >= 80) return '良好';
    if (score >= 70) return '中等';
    if (score >= 60) return '及格';
    return '待提升';
  },

  getScoreDesc(score) {
    if (score >= 90) return '表现出色，具备很强的竞争力';
    if (score >= 80) return '表现良好，略作提升即可拿到Offer';
    if (score >= 70) return '基本达标，部分维度需要加强';
    if (score >= 60) return '勉强及格，建议系统性复习';
    return '需要大量练习，建议从基础开始补强';
  },

  // 绘制雷达图
  drawRadarChart(dimensions) {
    const query = this.createSelectorQuery();
    query.select('#radarCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node || !res[0].width || !res[0].height) return;
        try {
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getWindowInfo().pixelRatio;
        canvas.width = res[0].width * dpr;
        canvas.height = res[0].height * dpr;
        ctx.scale(dpr, dpr);

        const w = res[0].width;
        const h = res[0].height;
        const cx = w / 2;
        const cy = h / 2;
        const labelPad = 36;
        const radius = Math.min(w, h) / 2 - labelPad;
        const n = dimensions.length;
        const angleStep = (2 * Math.PI) / n;
        const startAngle = -Math.PI / 2;

        // 背景
        ctx.fillStyle = '#F8FAFF';
        ctx.fillRect(0, 0, w, h);

        // 背景网格（4层）
        const layers = [0.25, 0.5, 0.75, 1.0];
        layers.forEach((scale, li) => {
          ctx.beginPath();
          for (let i = 0; i < n; i++) {
            const angle = startAngle + i * angleStep;
            const x = cx + radius * scale * Math.cos(angle);
            const y = cy + radius * scale * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.strokeStyle = li === 3 ? '#C7D2FE' : '#E8EDFB';
          ctx.lineWidth = li === 3 ? 1.5 : 1;
          ctx.stroke();
          if (scale < 1) {
            ctx.fillStyle = '#C4C9D4';
            ctx.font = '9px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(Math.round(scale * 100)), cx, cy - radius * scale - 5);
          }
        });

        // 轴线
        for (let i = 0; i < n; i++) {
          const angle = startAngle + i * angleStep;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
          ctx.strokeStyle = '#DDE3F5';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // 数据填充区域（纯色，避免 createLinearGradient 兼容性问题）
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const angle = startAngle + i * angleStep;
          const val = (dimensions[i].score || 0) / 100;
          const x = cx + radius * val * Math.cos(angle);
          const y = cy + radius * val * Math.sin(angle);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(67, 56, 202, 0.18)';
        ctx.fill();
        ctx.strokeStyle = '#4338CA';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 绘制数据点
        for (let i = 0; i < n; i++) {
          const angle = startAngle + i * angleStep;
          const val = (dimensions[i].score || 0) / 100;
          const x = cx + radius * val * Math.cos(angle);
          const y = cy + radius * val * Math.sin(angle);
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, 2 * Math.PI);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.strokeStyle = '#4338CA';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // 绘制标签（名称 + 分数两行）
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < n; i++) {
          const angle = startAngle + i * angleStep;
          const labelR = radius + 22;
          const lx = cx + labelR * Math.cos(angle);
          const ly = cy + labelR * Math.sin(angle);
          const name = dimensions[i].name;
          const score = dimensions[i].score;
          const color = dimensions[i].color || '#4338CA';
          // 维度名
          ctx.fillStyle = '#374151';
          ctx.font = 'bold 11px sans-serif';
          ctx.fillText(name, lx, ly - 7);
          // 分数（彩色）
          ctx.fillStyle = color;
          ctx.font = 'bold 12px sans-serif';
          ctx.fillText(String(score), lx, ly + 8);
        }
        } catch (e) {
          console.error('[radarChart]', e);
        }
      });
  },

  // 保存报告截图到相册
  saveAsImage() {
    const report = this.data.report;
    if (!report) return;
    wx.showLoading({ title: '生成中...', mask: true });

    const W = 750, H = 980;
    const offscreen = wx.createOffscreenCanvas({ type: '2d', width: W, height: H });
    const ctx = offscreen.getContext('2d');

    // 背景
    ctx.fillStyle = '#F4F6F9';
    ctx.fillRect(0, 0, W, H);

    // 顶部深色块
    ctx.fillStyle = '#0D1B3E';
    ctx.fillRect(0, 0, W, 210);

    // 职位 + 公司
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText((report.role || '') + (report.company ? '  @' + report.company : ''), 40, 88);

    // 总分圆圈
    ctx.beginPath();
    ctx.arc(W - 90, 105, 62, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 50px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(report.totalScore || 0), W - 90, 98);
    ctx.font = '18px sans-serif';
    ctx.fillText(report.scoreLevel || '', W - 90, 136);

    // 评分描述
    ctx.font = '21px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(report.scoreDesc || '', 40, 180);

    // 维度标题
    ctx.fillStyle = '#222';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('能力维度评分', 40, 252);

    // 维度条目
    const dims = report.dimensions || [];
    dims.forEach((d, i) => {
      const y = 278 + i * 72;
      ctx.fillStyle = '#333';
      ctx.font = '22px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.name, 40, y + 10);
      ctx.fillStyle = d.color || '#2B5CE6';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(String(d.score), W - 40, y + 10);
      const bx = 155, bw = W - 215, bh = 12, by = y + 26;
      ctx.fillStyle = '#e4e4e4';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = d.color || '#2B5CE6';
      ctx.fillRect(bx, by, bw * (d.score / 100), bh);
    });

    // 建议框
    const sugY = 278 + dims.length * 72 + 18;
    ctx.fillStyle = '#e6f7ff';
    ctx.fillRect(30, sugY, W - 60, 110);
    ctx.fillStyle = '#2B5CE6';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('备考建议', 50, sugY + 28);
    ctx.fillStyle = '#333';
    ctx.font = '20px sans-serif';
    const tip = (report.suggestion || report.summary || '').slice(0, 56);
    ctx.fillText(tip, 50, sugY + 60);
    const tip2 = (report.suggestion || report.summary || '').slice(56, 112);
    if (tip2) ctx.fillText(tip2, 50, sugY + 88);

    // 页脚
    ctx.fillStyle = '#aaa';
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('留学生求职助手 · AI面试报告 · ' + (report.createTime || ''), W / 2, H - 20);

    wx.canvasToTempFilePath({
      canvas: offscreen,
      success: (res) => {
        wx.hideLoading();
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
          fail: () => wx.showToast({ title: '请先授权相册权限', icon: 'none' })
        });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '生成失败，请重试', icon: 'none' });
      }
    });
  },

  onShareAppMessage() {
    const report = this.data.report;
    return {
      title: report ? `我在AI模拟面试中获得了 ${report.totalScore} 分！` : 'AI模拟面试报告',
      path: '/pages/ai-history/ai-history'
    };
  },

  // 重新面试
  retryInterview() {
    wx.navigateBack();
  }
})
