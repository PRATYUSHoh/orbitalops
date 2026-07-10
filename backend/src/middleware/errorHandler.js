// GLOBAL error handler. Express recognizes this as an error handler
// specifically because it takes 4 arguments (err, req, res, next) —
// that signature is how Express distinguishes it from normal middleware.
// MUST be registered LAST in app.js, after all routes.
module.exports = (err, req, res, next) => {
  console.error('[error]', err);

  const status = err.status || 500;

  res.status(status).json({
    error: err.message || 'Internal Server Error',
    // never leak err.stack to the client — fine to log it above, not to send it
  });
};