# 职引面试准备 Skill

## 业务流程

用户查询公司或岗位面经
→ 调用 `searchInterviewExperiences`
→ 展示面经列表卡片
→ 用户点击某条面经
→ 调用 `getInterviewExperienceDetail`
→ 展示面经详情卡片
→ 用户进入职引面经详情页。

## 强制约束

1. `experienceId` 必须来自真实接口。
2. 禁止编造真实面经内容。
3. 禁止将 AI 生成内容描述成真实用户面经。
4. 如未来增加 AI 题库，必须明确标记为“AI 生成练习题”。
5. 没有结果时，可以推荐相似岗位面经，但必须明确说明是相似岗位。
6. 查询结果最多展示 5 条。
7. 卡片跳转到现有面经或面试准备真实页面。
8. 第一阶段只查询和展示真实面经。

## 已复用接口

- 面经列表：`GET /api/experiences`
- 面经详情：`GET /api/experiences/:id`

## 页面

- 面试题库/准备页：`/pages/experiences/experiences`
- 面经详情页：`/package-content/pages/experience-detail/experience-detail?id={experienceId}`
