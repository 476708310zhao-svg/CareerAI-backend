# CareerAI Full Stack

CareerAI 留学生求职助手全栈代码仓库，包含 Node.js 后端、管理后台静态页和微信小程序端。

## 目录结构

```text
.
├── server.js              # 后端入口
├── routes/                # API 路由
├── middleware/            # 鉴权、限流等中间件
├── services/              # 业务服务
├── db/                    # 数据库初始化与工具
├── data/                  # 种子/静态数据
├── scripts/               # 数据同步脚本
├── admin/                 # 管理后台静态页面
└── miniprogram/           # 微信小程序端
```

## 本地开发

```bash
npm install
cp .env.example .env
npm run dev
```

小程序端请在微信开发者工具中打开 `miniprogram/` 目录。

## 提交规则

不要提交 `.env`、`node_modules/`、`uploads/`、数据库运行文件、微信私有配置和密钥文件。
