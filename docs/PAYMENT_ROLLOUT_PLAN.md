# 支付上线分阶段方案

更新时间：2026-06-24

## 结论

支付按三阶段推进。当前推荐使用小程序虚拟支付（道具直购）接入会员套餐；Mock 只允许本地或测试环境显式开启，不能进入正式环境。

## 阶段 1：开发环境 Mock 模式验证流程

- 目标：验证会员套餐、订单创建、Mock 支付确认、订单校验、VIP 开通、订单列表。
- 开启方式：仅非生产环境可设置 `ENABLE_MOCK_PAYMENT=true`。
- 生产策略：微信支付资质未完成前，生产 `.env` 必须设置 `PAYMENT_ENABLED=false`。
- 使用接口：
  - `POST /api/payment/create-order`
  - `POST /api/payment/mock-confirm`
  - `GET /api/payment/verify/:orderNo`
  - `GET /api/payment/orders`
- 不配置真实 `WXPAY_MCH_ID`、`WXPAY_API_KEY`、`WXPAY_APP_ID`、`WXPAY_NOTIFY_URL` 时，生产环境不得创建订单。
- 本阶段不得主动接入真实支付回调，也不得让用户通过 Mock 开通真实权益。

## 阶段 2：虚拟支付配置

- 微信公众平台已开通小程序虚拟支付。
- 在虚拟支付后台配置 3 个道具，分别对应月卡、季卡、年卡，价格需与后端 `PLANS` 一致。
- 生产 `.env` 配置：
  - `PAYMENT_ENABLED=true`
  - `PAYMENT_PROVIDER=virtual`
  - `MEMBERSHIP_FEATURE_ENABLED=true`
  - `VIRTUAL_PAY_ENV=0`
  - `VIRTUAL_PAY_OFFER_ID`
  - `VIRTUAL_PAY_APP_KEY`
  - `VIRTUAL_PAY_MONTH_PRODUCT_ID`
  - `VIRTUAL_PAY_QUARTER_PRODUCT_ID`
  - `VIRTUAL_PAY_YEAR_PRODUCT_ID`
  - `VIRTUAL_PAY_NOTIFY_TOKEN`
- 在微信后台把发货通知地址配置为 `https://yourdomain.com/api/payment/virtual-notify`，或复用 `https://yourdomain.com/api/payment/notify`。

## 阶段 3：真实支付灰度上线

- 访问 `GET /api/payment/config` 确认 `data.provider=virtual`、`data.available=true`、`data.mock=false`。
- 小流量灰度，重点验证 `wx.requestVirtualPayment` 拉起、`paySig/signature` 签名、发货通知验签、订单幂等、订单状态和 VIP 到期时间。
- 真实支付上线前必须单独评审，不和普通 P1/P2 优化混合提交。
