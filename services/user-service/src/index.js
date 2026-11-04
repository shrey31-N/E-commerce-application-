const { createApp } = require('./app');

const port = process.env.PORT || 3001;
const app = createApp();
const server = app.listen(port, () => console.log(`[user-service] listening on :${port}`));

process.on('SIGTERM', () => server.close(() => process.exit(0)));
