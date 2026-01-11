module.exports = {
  apps: [
    {
      name: 'proxy-service',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '500M',
      error_file: '.pm2/logs/proxy-service-error.log',
      out_file: '.pm2/logs/proxy-service-out.log',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false,
    },
  ],
  deploy: {
    production: {
      user: 'ec2-user',
      host: 'group',
      ref: 'origin/main',
      repo: 'https://github.com/your-repo/suffix-tool.git',
      path: '/home/ec2-user/proxy-service',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
    },
  },
};
