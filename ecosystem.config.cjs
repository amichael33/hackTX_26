module.exports = {
  apps: [
    {
      name: 'store',
      script: 'server/index.js',
      env: { NODE_ENV: 'production' },
    },
  ],
};
