# 支付上线分阶段方案

更新时间：2026-06-10

## 结论

支付按三阶段推进。当前阶段生产环境关闭真实收款入口；Mock 只允许本地或测试环境显式开启，不能进入正式环境。

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

## 阶段 2：资质准备

- 完成营业执照、微信商户号、小程序支付产品开通。
- 准备正式域名和 HTTPS 回调地址。
- 补充真实支付沙箱或灰度验收清单。

## 阶段 3：真实支付灰度上线

- 配置真实微信支付参数。
- 将生产 `PAYMENT_ENABLED` 改为 `true`。
- 访问 `GET /api/payment/config` 确认 `data.available=true`、`data.mock=false`。
- 小流量灰度，重点验证金额校验、签名校验、回调幂等、订单状态和 VIP 到期时间。
- 真实支付上线前必须单独评审，不和普通 P1/P2 优化混合提交。
