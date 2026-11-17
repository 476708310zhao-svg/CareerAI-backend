# 中国内地校招与实习：20 家企业官网试点

试点口径：每家公司有固定的招聘官网入口。其中 10 家公开 ATS 招聘板可自动读取当前公开职位；另外 10 家仅提供企业官网入口，**不计入搜索职位数量**。自动同步的公司也可能暂时没有匹配职位。当前没有通用的国内校招官方聚合 API。

| 企业 | 接入方式 | 招聘官网 |
| --- | --- | --- |
| Enhesa | Greenhouse 公开职位 | https://job-boards.greenhouse.io/enhesa |
| Landor | Greenhouse 公开职位 | https://job-boards.greenhouse.io/landor |
| Prophet | Greenhouse 公开职位 | https://job-boards.greenhouse.io/prophet |
| Artefact | Greenhouse 公开职位 | https://job-boards.greenhouse.io/artefact |
| WorldQuant | Greenhouse 公开职位 | https://job-boards.greenhouse.io/worldquant |
| AlphaGrep | Greenhouse 公开职位 | https://job-boards.greenhouse.io/alphagrepsecurities |
| AXQ | Greenhouse 公开职位 | https://job-boards.greenhouse.io/axq |
| Meshy | Ashby 公开职位 | https://jobs.ashbyhq.com/meshy |
| Scientech Research | Ashby 公开职位 | https://jobs.ashbyhq.com/scientech-research |
| Hypebeast | Lever 公开职位 | https://jobs.lever.co/hypebeast |
| 阿里巴巴 | 仅官网入口 | https://campus-talent.alibaba.com/ |
| 字节跳动 | 仅官网入口 | https://jobs.bytedance.com/campus |
| 腾讯 | 仅官网入口 | https://join.qq.com/ |
| 华为 | 仅官网入口 | https://career.huawei.com/cn/campus-recruitment |
| 美团 | 仅官网入口 | https://zhaopin.meituan.com/web/campus |
| 百度 | 仅官网入口 | https://talent.baidu.com/jobs/ |
| 京东 | 仅官网入口 | https://zhaopin.jd.com/home |
| 拼多多 | 仅官网入口 | https://careers.pddglobalhr.com/ |
| 小米 | 仅官网入口 | https://hr.xiaomi.com/website/campus.html |
| 中国移动 | 仅官网入口 | https://job.10086.cn/ |

后端 `GET /api/jobs/official-boards` 返回完整清单及接入方式；`GET /api/jobs/aggregate?country=cn&query=实习` 将公开官网职位与 JSearch 合并，并在 `sourceStatus` 中区分空结果和来源故障。`GET /api/jobs/detail?job_id=official_...` 与 `GET /api/jobs/official_...` 返回同一条官网职位的详情。小程序“岗位机会”选择“中国内地”后可查看清单和复制官网地址。

公开招聘板使用固定 URL 服务端读取，按企业缓存 1 小时；仅接受明确指向该企业职位详情的 HTTPS 链接。仅把 ATS 中明确的 `publishedAt` 写入发布日期；Greenhouse 更新日期和 Lever 创建日期不会冒充发布日期。薪资、签证等字段没有来源证据时留空。

后续若要把阿里、字节等国内企业从“官网入口”升级为“自动同步”，应逐站确认企业允许的公开接口或取得数据合作，并针对每站验证职位 ID、岗位状态、分页、申请链接和更新频率。避免把官网首页或搜索页包装成一条岗位。

数据接口文档：[Greenhouse Job Board API](https://docs.greenhouse.io/job-board)、[Ashby Job Postings API](https://developers.ashbyhq.com/docs/public-job-posting-api)、[Lever Postings API](https://github.com/lever/postings-api)。
