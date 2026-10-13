const SLOW_MS = Number(process.env.API_SLOW_MS || 1500);

function routeKey(req) {
  const pattern = req.route?.path;
  if (pattern) return `${req.method} ${req.baseUrl || ''}${pattern}`;
  return `${req.method} ${(req.originalUrl || req.url || '').split('?')[0]}`;
}

function requestTiming(req, res, next) {
  const start = process.hrtime.bigint();
  const elapsedMs = () => Number(process.hrtime.bigint() - start) / 1e6;

  const originalWriteHead = res.writeHead;
  res.writeHead = function writeHeadWithTiming(...args) {
    if (!res.headersSent) {
      res.setHeader('Server-Timing', `app;dur=${elapsedMs().toFixed(1)}`);
    }
    return originalWriteHead.apply(this, args);
  };

  res.on('finish', () => {
    const ms = elapsedMs();
    if (ms >= SLOW_MS) {
      console.warn(`[slow-api] ${routeKey(req)} ${res.statusCode} ${ms.toFixed(0)}ms`);
    }
  });

  next();
}

module.exports = { requestTiming };
