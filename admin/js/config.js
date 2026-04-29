// admin/js/config.js
// 管理后台 API 基础地址配置
// 本地开发：http://localhost:3001
// 生产环境：修改为实际后端地址
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '192.168.110.47'];
window.ADMIN_API = LOCAL_HOSTS.includes(location.hostname)
  ? `${location.protocol}//${location.host}`
  : 'https://api.zhiyincareer.com';
