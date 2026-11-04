const { createApp } = require('./app');

const port = process.env.PORT || 3002;
const server = createApp().listen(port, () => console.log(`[product-service] listening on :${port}`));

process.on('SIGTERM', () => server.close(() => process.exit(0)));
