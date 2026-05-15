/**
 * resume-export.js — 简历导出/复制相关方法（从 resume.js 拆分）
 * 用法：Object.assign 混入 Page 配置
 */

module.exports = {
  // ── 复制简历文本到剪贴板（公开方法，WXML 直接调用）─────────
  copyResumeText() {
    const r = this.data.onlineResume;
    const b = r.basicInfo || {};
    const lines = [];

    if (b.name) lines.push('【' + b.name + '】');
    if (b.title) lines.push(b.title);
    const contacts = [b.phone, b.email, b.location, b.linkedin].filter(Boolean);
    if (contacts.length) lines.push(contacts.join(' | '));
    lines.push('');

    if (r.summary) {
      lines.push('── 个人优势 ──');
      lines.push(r.summary);
      lines.push('');
    }

    if (r.education && r.education.length > 0) {
      lines.push('── 教育经历 ──');
      r.education.forEach(e => {
        lines.push(e.school + (e.time ? '  ' + e.time : ''));
        lines.push(e.degree + (e.major ? ' · ' + e.major : ''));
      });
      lines.push('');
    }

    if (r.workExp && r.workExp.length > 0) {
      lines.push('── 工作经历 ──');
      r.workExp.forEach(w => {
        lines.push(w.company + (w.time ? '  ' + w.time : ''));
        if (w.role) lines.push(w.role);
        if (w.desc) lines.push(w.desc);
        lines.push('');
      });
    }

    if (r.projects && r.projects.length > 0) {
      lines.push('── 项目经历 ──');
      r.projects.forEach(p => {
        lines.push(p.name + (p.time ? '  ' + p.time : ''));
        if (p.role) lines.push(p.role);
        if (p.desc) lines.push(p.desc);
        lines.push('');
      });
    }

    if (r.skills && r.skills.length > 0) {
      lines.push('── 技能 ──');
      lines.push(r.skills.join(' · '));
    }

    const text = lines.join('\n').trim();
    if (!text) {
      wx.showToast({ title: '请先完善简历信息', icon: 'none' });
      return;
    }

    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '简历文本已复制', icon: 'success' })
    });
  },

  // ── 导出入口（ActionSheet 选择图片/文本）────────────────────
  exportResume() {
    wx.showActionSheet({
      itemList: ['📷 导出为图片（保存相册）', '📋 复制简历全文'],
      success: (res) => {
        if (res.tapIndex === 0) this._exportAsImage();
        else this._copyResumeText();
      }
    });
  },

  // ── 复制简历全文（紧凑格式）─────────────────────────────────
  _copyResumeText() {
    const r = this.data.onlineResume;
    const b = r.basicInfo || {};
    const lines = [];
    if (b.name)  lines.push(b.name + (b.title ? '  |  ' + b.title : ''));
    if (b.email) lines.push('Email: ' + b.email);
    if (b.phone) lines.push('Phone: ' + b.phone);
    if (b.location) lines.push('Location: ' + b.location);
    if (b.linkedin) lines.push('LinkedIn: ' + b.linkedin);
    lines.push('');
    if (r.summary) { lines.push('== 个人优势 =='); lines.push(r.summary); lines.push(''); }
    if ((r.education || []).length) {
      lines.push('== 教育经历 ==');
      r.education.forEach(e => lines.push(e.school + '  ' + e.degree + '  ' + e.time));
      lines.push('');
    }
    if ((r.workExp || []).length) {
      lines.push('== 工作经历 ==');
      r.workExp.forEach(w => { lines.push(w.company + ' — ' + w.position + '  ' + w.time); if (w.desc) lines.push(w.desc); lines.push(''); });
    }
    if ((r.projects || []).length) {
      lines.push('== 项目经历 ==');
      r.projects.forEach(p => { lines.push(p.name + ' | ' + p.role + '  ' + p.time); if (p.desc) lines.push(p.desc); lines.push(''); });
    }
    if ((r.skills || []).length) {
      lines.push('== 技能 ==');
      lines.push(r.skills.join(' · '));
    }
    wx.setClipboardData({
      data: lines.join('\n'),
      success: () => wx.showToast({ title: '简历全文已复制', icon: 'success' })
    });
  },

  // ── Canvas 2D 导出图片 ─────────────────────────────────────
  _exportAsImage() {
    const sysInfo = wx.getSystemInfoSync();
    const ratio = sysInfo.pixelRatio;
    const winW = sysInfo.windowWidth;
    const r = this.data.onlineResume;
    const b = r.basicInfo || {};

    this.setData({ exportLoading: true });

    wx.createSelectorQuery().select('#resumeExportCanvas').fields({ node: true, size: true })
      .exec((queryRes) => {
        if (!queryRes || !queryRes[0]) {
          this.setData({ exportLoading: false });
          wx.showToast({ title: '画布初始化失败', icon: 'none' });
          return;
        }
        const canvas = queryRes[0].node;
        const ctx = canvas.getContext('2d');

        const W = winW;
        let totalH = 200;
        if (r.summary) totalH += 120;
        totalH += (r.education || []).length * 80 + 60;
        totalH += (r.workExp || []).length * 120 + 60;
        totalH += (r.projects || []).length * 100 + 60;
        if ((r.skills || []).length) totalH += 80;
        totalH = Math.max(totalH, 400);

        canvas.width  = W * ratio;
        canvas.height = totalH * ratio;
        ctx.scale(ratio, ratio);

        // Background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, W, totalH);

        let y = 40;
        const pad = 32;

        // Header bar
        ctx.fillStyle = '#2B5CE6';
        ctx.fillRect(0, 0, W, 8);
        y = 28;

        // Name
        ctx.fillStyle = '#111827';
        ctx.font = 'bold 26px PingFang SC, sans-serif';
        ctx.fillText(b.name || '姓名', pad, y + 26);
        y += 40;

        // Title
        if (b.title) {
          ctx.fillStyle = '#6B7280';
          ctx.font = '16px PingFang SC, sans-serif';
          ctx.fillText(b.title, pad, y);
          y += 28;
        }

        // Contact row
        const contact = [b.email, b.phone, b.location].filter(Boolean).join('  |  ');
        if (contact) {
          ctx.fillStyle = '#9CA3AF';
          ctx.font = '14px PingFang SC, sans-serif';
          ctx.fillText(contact, pad, y);
          y += 28;
        }

        // Divider
        y += 10;
        ctx.strokeStyle = '#E5E7EB';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
        y += 16;

        const drawSection = (title, items) => {
          ctx.fillStyle = '#2B5CE6';
          ctx.font = 'bold 16px PingFang SC, sans-serif';
          ctx.fillText(title, pad, y);
          y += 24;
          ctx.strokeStyle = '#EEF2FF';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
          y += 14;
          ctx.fillStyle = '#374151';
          ctx.font = '14px PingFang SC, sans-serif';
          items.forEach(line => {
            if (y > totalH - 20) return;
            const maxW = W - pad * 2;
            let words = line;
            while (words.length > 0) {
              let chunk = words;
              while (ctx.measureText(chunk).width > maxW && chunk.length > 1) chunk = chunk.slice(0, -1);
              ctx.fillText(chunk, pad, y);
              y += 22;
              words = words.slice(chunk.length);
            }
          });
          y += 10;
        };

        if (r.summary) {
          drawSection('个人优势', [r.summary]);
        }
        if ((r.education || []).length) {
          drawSection('教育经历', r.education.map(e => e.school + '  ' + e.degree + '  ' + e.time));
        }
        if ((r.workExp || []).length) {
          drawSection('工作经历', r.workExp.map(w => w.company + ' — ' + w.position + '  ' + w.time + (w.desc ? '\n' + w.desc : '')).join('\n\n').split('\n').filter(Boolean));
        }
        if ((r.projects || []).length) {
          drawSection('项目经历', r.projects.map(p => p.name + ' | ' + p.role + '  ' + p.time + (p.desc ? '\n' + p.desc : '')).join('\n\n').split('\n').filter(Boolean));
        }
        if ((r.skills || []).length) {
          drawSection('技能', [r.skills.join(' · ')]);
        }

        wx.canvasToTempFilePath({
          canvas,
          success: (imgRes) => {
            this.setData({ exportLoading: false });
            wx.saveImageToPhotosAlbum({
              filePath: imgRes.tempFilePath,
              success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
              fail: (err) => {
                if (err.errMsg && err.errMsg.includes('auth')) {
                  wx.openSetting({ success: () => wx.showToast({ title: '请开启相册权限后重试', icon: 'none' }) });
                } else {
                  wx.showToast({ title: '保存失败，请重试', icon: 'none' });
                }
              }
            });
          },
          fail: () => {
            this.setData({ exportLoading: false });
            wx.showToast({ title: '导出失败，请重试', icon: 'none' });
          }
        });
      });
  }
};
