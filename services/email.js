// services/email.js — 邮件发送服务（NodeMailer SMTP + 开发模式兜底）
const nodemailer = require('nodemailer');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  _transporter = nodemailer.createTransport({
    host:   SMTP_HOST,
    port:   Number(SMTP_PORT) || 465,
    secure: Number(SMTP_PORT) !== 587, // 587 用 STARTTLS，其余用 SSL
    auth:   { user: SMTP_USER, pass: SMTP_PASS },
  });
  return _transporter;
}

function buildHtml(code) {
  return `<!DOCTYPE html>
<html lang="zh">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#003A99,#0A6EFF);padding:32px 40px;text-align:center">
            <span style="font-size:28px;font-weight:800;color:#fff;letter-spacing:-0.5px">职引</span>
            <p style="margin:6px 0 0;color:rgba(255,255,255,.75);font-size:13px">留学生一站式求职平台</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px">
            <p style="margin:0 0 8px;color:#374151;font-size:15px">您好，</p>
            <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.6">
              您正在登录 <strong>职引</strong>，请使用以下验证码完成验证：
            </p>
            <!-- Code block -->
            <div style="background:#f0f4ff;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px">
              <span style="font-size:40px;font-weight:800;letter-spacing:10px;color:#0052CC">${code}</span>
              <p style="margin:10px 0 0;color:#6b7280;font-size:13px">验证码 5 分钟内有效</p>
            </div>
            <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6">
              如果这不是您的操作，请忽略此邮件。<br>
              请勿将验证码告知任何人。
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #f0f0f0;text-align:center">
            <p style="margin:0;color:#d1d5db;font-size:12px">© 2025 职引 · www.zhiyincareer.com</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * 发送邮箱验证码
 * @param {string} to   收件人邮箱
 * @param {string} code 6 位验证码
 */
async function sendEmailCode(to, code) {
  const transporter = getTransporter();

  if (!transporter) {
    if (IS_PRODUCTION) {
      throw new Error('SMTP 未完成生产配置');
    }
    // 未配置 SMTP → 开发模式，控制台打印
    console.log(`[Email Dev] To: ${to}  Code: ${code}`);
    return { dev: true };
  }

  const from = process.env.SMTP_FROM || `职引 <${process.env.SMTP_USER}>`;

  await transporter.sendMail({
    from,
    to,
    subject: `【职引】您的验证码是 ${code}`,
    html: buildHtml(code),
  });

  return { ok: true };
}

module.exports = { sendEmailCode };
