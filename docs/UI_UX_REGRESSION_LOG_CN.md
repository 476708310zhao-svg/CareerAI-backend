# UI/UX 优化提交记录与回归检查清单

> 目标：每轮 UI/UX 优化都能被追踪、复盘和回归验证，避免“改完看起来不错，但后续不知道改了什么、测了什么、风险在哪里”。

## 一、每轮提交记录模板

```md
## YYYY-MM-DD 优化主题

- Commit：
- 优化页面：
- 优化类型：视觉 / UX / AI 体验 / 性能 / 组件化 / 文档
- 主要问题：
- 本轮改动：
- 复用组件或工具类：
- 验收结果：
- 已运行检查：
- 未覆盖风险：
- 下一步建议：
```

## 二、提交前必查清单

- [ ] 本轮改动范围清晰，没有混入无关文件。
- [ ] 已确认未覆盖用户或其它工具正在改的脏文件。
- [ ] 页面 WXML 标签结构检查通过。
- [ ] 相关 JS 文件 `node --check` 通过。
- [ ] `git diff --check` 无空白错误。
- [ ] 路线图或验收文档已同步更新。
- [ ] 提交信息能准确描述本轮优化。
- [ ] 推送后已确认远端分支更新成功。

## 三、常用检查命令

### Git 状态

```powershell
git status --short
git diff --stat -- <files>
git diff --check -- <files>
git diff --cached --stat
git log -1 --oneline
```

### JS 语法检查

```powershell
node --check "miniprogram\pages\<page>\<page>.js"
node --check "miniprogram\components\<component>\<component>.js"
```

### WXML 结构检查

```powershell
node -e "const fs=require('fs');const f='miniprogram/pages/<page>/<page>.wxml';const s=fs.readFileSync(f,'utf8');const count=x=>s.split(x).length-1;const counts={viewOpen:count('<view'),viewClose:count('</view>'),textOpen:count('<text'),textClose:count('</text>')};console.log(counts);if(counts.viewOpen!==counts.viewClose||counts.textOpen!==counts.textClose)process.exit(1);"
```

### 小程序关键文件 JSON 检查

```powershell
node -e "const fs=require('fs');JSON.parse(fs.readFileSync('miniprogram/app.json','utf8'));console.log('app json ok');"
```

## 四、页面回归重点

### 首页

- [ ] Banner 图片能正常加载，失败时有兜底。
- [ ] 金刚区图标、热门企业 logo、热门岗位 logo 不变形。
- [ ] 热门岗位空状态有行动按钮。
- [ ] 搜索、查看更多、公司详情跳转正常。

### 岗位推荐页

- [ ] 搜索框、筛选、热门 chips 不换行挤压。
- [ ] 岗位列表 logo 与职位详情 logo 一致。
- [ ] 列表/地图切换不卡顿。
- [ ] 空状态、加载更多、无更多状态正常。

### 职位详情页

- [ ] 公司 logo 加载失败后有首字母兜底。
- [ ] 标签使用 `c-tag` 且不溢出。
- [ ] 底部主 CTA 是“一键投递”，AI 面试为辅助。
- [ ] 投递弹窗、复制简历、加入看板流程正常。

### 公司详情页

- [ ] 公司 logo 使用 `c-company-logo`。
- [ ] 职位、面经、薪资、AI 洞察卡片使用 `ux-list-card`。
- [ ] 底部“查看在招岗位”能滚动到 tabs。
- [ ] AI 洞察生成、刷新、空状态正常。

### AI 助手页

- [ ] 历史侧栏可打开/关闭。
- [ ] 首条欢迎快捷指令可点击。
- [ ] AI loading 阶段反馈可见。
- [ ] AI 回复后的结果卡可复制、保存、继续追问、拆成清单。
- [ ] 键盘弹起时输入栏不遮挡消息。

### 我的页

- [ ] 顶部用户信息不挤压。
- [ ] 求职工具、常用功能列表点击态正常。
- [ ] 底部无异常空白和横向滚动条。

## 五、风险分级

- P0：页面无法打开、主流程无法使用、支付/登录/投递失败。
- P1：核心 CTA、AI 生成、岗位/公司详情等强转化路径异常。
- P2：视觉错位、留白异常、文案误导、logo/图片兜底异常。
- P3：注释、命名、低风险样式重复、文档缺失。

## 六、最近 UI/UX 提交记录

| Commit | 主题 | 类型 | 备注 |
| --- | --- | --- | --- |
| `9e115c7` | Add page UI acceptance checklist | 文档 | 新增页面级 UI/UX 验收清单 |
| `5d96e81` | Clean stale mini program style comments | 维护 | 清理过期暗色覆盖和历史注释 |
| `ef0fe51` | Extract shared AI result card styles | 组件化 | 抽离 AI 结果卡工具类 |
| `99d374d` | Extract shared list card utility | 组件化 | 抽离列表卡工具类 |
| `fa0d7ec` | Use shared tag component in detail pages | 组件化 | 详情页标签接入 `c-tag` |
| `b63e3cf` | Add shared company logo component | 组件化 | 新增并接入 `c-company-logo` |

## 七、发布前最小回归路径

- [ ] 打开首页，检查 Banner、金刚区、热门企业、热门岗位。
- [ ] 从首页进入公司详情页，点击“查看在招岗位”，再进入职位详情页。
- [ ] 在职位详情页点击 AI 面试和一键投递，确认流程可用。
- [ ] 打开 AI 助手，发送一条消息，检查 loading、回复、结果卡操作。
- [ ] 打开我的页，检查会员入口、工具列表、底部安全区。
- [ ] 微信开发者工具无新增 WXML/JS 报错。
