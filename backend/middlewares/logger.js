function loggerMiddleware(req, startTime) {
  const duration = Date.now() - startTime;
  const ts       = new Date().toISOString();
  console.log(`${ts} | ${req.method.padEnd(7)} ${req.url.padEnd(40)} — ${duration}ms`);
}

module.exports = loggerMiddleware;
