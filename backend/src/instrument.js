require('dotenv').config();

const Sentry = require('@sentry/node');
const { nodeProfilingIntegration } = require('@sentry/profiling-node');

if (process.env.SENTRY_DSN) {
  const enableProfiling = process.env.SENTRY_ENABLE_PROFILING === 'true';
  const enableLogs = process.env.SENTRY_ENABLE_LOGS !== 'false';
  const tracesSampleRate =
    process.env.SENTRY_TRACES_SAMPLE_RATE != null && process.env.SENTRY_TRACES_SAMPLE_RATE !== ''
      ? Number(process.env.SENTRY_TRACES_SAMPLE_RATE)
      : process.env.NODE_ENV === 'production'
        ? 0.2
        : 1.0;
  const profileSessionSampleRate =
    process.env.SENTRY_PROFILE_SESSION_SAMPLE_RATE != null && process.env.SENTRY_PROFILE_SESSION_SAMPLE_RATE !== ''
      ? Number(process.env.SENTRY_PROFILE_SESSION_SAMPLE_RATE)
      : process.env.NODE_ENV === 'production'
        ? 0.1
        : 1.0;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    sendDefaultPii: false,
    tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0.2,
    enableLogs,
    integrations: enableProfiling ? [nodeProfilingIntegration()] : [],
    profileSessionSampleRate: Number.isFinite(profileSessionSampleRate) ? profileSessionSampleRate : 0.1,
    profileLifecycle: 'trace',
  });
}
