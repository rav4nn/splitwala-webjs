module.exports = {
  apps: [
    {
      name:                'splitwala-wa',
      script:              'index.js',
      watch:               false,
      autorestart:         true,
      restart_delay:       5000,
      min_uptime:          '60s',
      max_restarts:        50,
      max_memory_restart:  '1G',
      kill_timeout:        10000,
      log_date_format:     'YYYY-MM-DD HH:mm:ss',
      error_file:          'logs/wa-error.log',
      out_file:            'logs/wa-out.log',
      merge_logs:          true,
      env: {
        // HEALTHCHECK_URL: 'https://hc-ping.com/your-uuid-here',
      },
    },
    {
      name:                'splitwala-tg',
      script:              'index-tg.js',
      watch:               false,
      autorestart:         true,
      restart_delay:       3000,
      min_uptime:          '30s',
      max_restarts:        50,
      max_memory_restart:  '256M',
      kill_timeout:        5000,
      log_date_format:     'YYYY-MM-DD HH:mm:ss',
      error_file:          'logs/tg-error.log',
      out_file:            'logs/tg-out.log',
      merge_logs:          true,
      env: {
        // Loaded from .env via dotenv inside index-tg.js
      },
    },
  ],
};
