// ENTRYPOINT — kept deliberately thin. Only job: load env vars,
// import the already-configured app, and start listening.
require('dotenv').config();

const app = require('./app');

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`[server] listening on port ${PORT}`);
});