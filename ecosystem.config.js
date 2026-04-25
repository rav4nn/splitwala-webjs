module.exports = {
  apps: [
    {
      name:                'splitwala',
      script:              'index.js',
      watch:               false,
      autorestart:         true,
      restart_delay:       5000,   // ms to wait before restarting after a crash
      min_uptime:          '60s',  // must stay up 60s before counting as "started"
      max_restarts:        50,     // tolerate flapping during WhatsApp Web rollouts
      max_memory_restart:  '1G',   // recycle Chromium before it OOMs the box
      kill_timeout:        10000,  // give Chromium 10s to shut down cleanly
      log_date_format:     'YYYY-MM-DD HH:mm:ss',
      error_file:          'logs/error.log',
      out_file:            'logs/out.log',
      merge_logs:          true,
      env: {
        // Paste the unique check URL from healthchecks.io here to enable
        // dead-man's-switch alerts (email/Telegram/Discord when bot dies).
        // HEALTHCHECK_URL: 'https://hc-ping.com/your-uuid-here',
      },
    },
  ],
};
