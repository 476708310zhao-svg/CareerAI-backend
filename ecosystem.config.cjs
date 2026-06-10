module.exports = {
  apps: [
    {
      name: 'jobapp-server',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      max_memory_restart: '512M',
      time: true,
      error_file: '/var/log/jobapp-server/error.log',
      out_file: '/var/log/jobapp-server/out.log',
      merge_logs: true
    }
  ]
};
