module.exports = {
  apps: [
    {
      name:             'splitwala',
      script:           'index.js',
      watch:            false,
      restart_delay:    5000,   // ms to wait before restarting after a crash
      max_restarts:     10,
      log_date_format:  'YYYY-MM-DD HH:mm:ss',
      error_file:       'logs/error.log',
      out_file:         'logs/out.log',
      merge_logs:       true,
    },
  ],
};
