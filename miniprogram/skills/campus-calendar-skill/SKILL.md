# 职引校招日历 Skill

## 业务流程

用户查询校招、暑期实习或截止时间
→ 调用 `searchCampusOpportunities` 或 `getUpcomingDeadlines`
→ 展示校招机会卡片
→ 用户进入职引校招日历页或校招详情页。

## 强制约束

1. `opportunityId` 必须来自真实接口。
2. 禁止编造截止日期。
3. 禁止编造适用届别。
4. 禁止编造签证标签。
5. 没有结果时，提示调整地区、方向、届别或截止时间范围。
6. 第一阶段不做自动提醒。
7. 第一阶段不做收藏写入。
8. 查询结果最多展示 5 条。
9. 卡片跳转到现有校招日历真实页面。
10. 所有动态数据以现有后端实时数据为准。

## 已复用接口

- 校招列表：`GET /api/campus`

## 页面

- 校招日历页：`/pages/campus/campus`
- 校招详情页：`/package-content/pages/campus-detail/campus-detail?id={opportunityId}`
