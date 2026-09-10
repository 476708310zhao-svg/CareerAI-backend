module.exports = {
  apps: [
    {
      name: process.env.PM2_APP_NAME || 'jobapp-server',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: Number(process.env.PORT || 4400),
        DATA_DIR: '/var/lib/jobapp-server/data',
        UPLOAD_DIR: '/var/lib/jobapp-server/uploads',
        DB_PATH: '/var/lib/jobapp-server/db/jobapp.db'
      },
      max_memory_restart: '512M',
      time: true,
      error_file: '/var/log/jobapp-server/error.log',
      out_file: '/var/log/jobapp-server/out.log',
      merge_logs: true
    }
  ]
};
