const { createApp } = require('./app');

const port = process.env.PORT || 3003;
const server = createApp().listen(port, () => console.log(`[order-service] listening on :${port}`));

process.on('SIGTERM', () => server.close(() => process.exit(0)));
