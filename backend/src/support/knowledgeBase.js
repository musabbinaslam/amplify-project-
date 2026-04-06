/**
 * Static AgentCalls product context for the Support chatbot (prompt context, not model training).
 * Keep aligned with app navigation and README.
 */
const AGENTCALLS_KNOWLEDGE = `
# AgentCalls — in-app reference (support bot)

## What AgentCalls is
AgentCalls connects licensed insurance agents with inbound phone calls in the browser (WebRTC via Twilio Voice). Agents go online, receive transfers, and manage leads and performance in one portal. Marketing site: agentcalls.io.

## Public vs app
- Public **Landing** (/) — hero, features, FAQ, sign in / sign up.
- Authenticated app lives under **/app** after login.

## Authentication
- Email/password and **Google** sign-in via Firebase Auth.
- **Sign up** collects profile/onboarding info (phone, verticals, spend, etc.) stored in Firestore.
- **Login** is for existing users; password reset via email.
- **Theme**: dark/light mode toggle (persists), available on landing and inside the app.

## Main navigation (sidebar)
- **Welcome** — onboarding-style intro, tutorial placeholder.
- **Take Calls** — go live, Twilio Voice in browser, mic/speaker, campaign/call flow, presence (online/offline), dialer overlay for ringing/active calls.
- **Dashboard** — metrics (calls, conversions, charts), campaign cards, performance overview.
- **Call Logs** — searchable history, filters, call metadata.
- **QA Feedback** — quality/feedback items (mock or real data depending on build).
- **Script** — editable call scripts, multiple templates, saved to Firestore.
- **Billing** — balance, credits, plans (e.g. Silver/Gold), purchase flows, low-balance warnings.
- **Licensed States** — US states the agent is licensed in; affects routing/eligibility.
- **Leads** — captured leads (beta), sources, landing page bookings.
- **Profile** — display name, avatar (compressed, stored in Firestore), bio, public landing slug, **webhook URL** and **API key** (X-Agent-Key) for integrations.
- **Support** — this chat + **Email support** form (subject, category, description); email sending may be phased in.
- **Settings** — audio devices (mic/speaker, gain), privacy (2FA placeholder, sessions, export data), danger zone (delete account for password users).
- **AI Training** — coming soon (nav item may be disabled).

## Integrations (Profile)
- Webhook URL for lead notifications to external systems.
- API key used as header **X-Agent-Key** for authenticated API calls.

## Technical stack (high level)
- Frontend: React, Vite, Zustand, React Router, Framer Motion.
- Backend (when used): Express, Socket.IO, Twilio, Firebase Admin.
- Real-time presence and call signaling may use WebSockets.

## Support boundaries
- Do not invent pricing, legal guarantees, or carrier-specific rules; direct users to Billing or licensed states screens and to human support for account-specific disputes.
- For anything not covered here, suggest **Email Support** on the Support page or support@agentcalls.io.
`.trim();

module.exports = { AGENTCALLS_KNOWLEDGE };
