<div align="center">

# AgentCalls

### Inbound Insurance Calls for Agents

Turn high-intent inbound calls into closed policies — right from your browser.

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![Node.js](https://img.shields.io/badge/Node.js-Express-339933?logo=node.js&logoColor=white)](https://expressjs.com)
[![Firebase](https://img.shields.io/badge/Firebase-Auth%20%2B%20Firestore-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com)
[![Twilio](https://img.shields.io/badge/Twilio-Voice%20SDK-F22F46?logo=twilio&logoColor=white)](https://www.twilio.com/docs/voice)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-Realtime-010101?logo=socket.io&logoColor=white)](https://socket.io)
[![License](https://img.shields.io/badge/License-Proprietary-red)](#license)

<br />

[Live Site](https://agentcalls.io) · [Report Bug](#) · [Request Feature](#)

</div>

---

## Overview

**AgentCalls** is a full-stack platform that connects licensed insurance agents with high-intent consumers through real-time inbound phone calls — directly in the browser. No cold calling, no softphones, no hardware. Agents sign up, select their licensed states and insurance verticals, go online, and start receiving live transfers via WebRTC.

The platform handles everything from call routing and agent presence to billing, performance dashboards, and AI-powered support — giving independent agents and agencies the tools to scale without the overhead.

<br />

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│  React 19 · Vite · Zustand · Framer Motion · Recharts      │
│  Twilio Voice SDK (WebRTC) · Firebase Auth (Client)         │
├─────────────────────────────────────────────────────────────┤
│                     ↕  REST + WebSocket                     │
├─────────────────────────────────────────────────────────────┤
│                        BACKEND                              │
│  Express · Socket.IO · Firebase Admin · Twilio REST API     │
│  Redis (Agent State) · TwiML Webhooks                       │
├─────────────────────────────────────────────────────────────┤
│                    EXTERNAL SERVICES                        │
│  Firebase (Auth + Firestore) · Twilio (Voice) · Redis       │
└─────────────────────────────────────────────────────────────┘
```

<br />

## Features

### Marketing & Public Pages
- **Landing page** with animated hero, stats, features grid, verticals showcase, FAQ accordion, and booking section
- **Dark / Light theme** toggle with system persistence
- Framer Motion scroll-triggered animations throughout

### Authentication
- Email/password signup & login via Firebase Auth
- Google OAuth one-click sign-in
- Password reset flow with email delivery
- Protected routes with automatic redirect

### Real-Time Call System
- **WebRTC-based browser dialer** powered by Twilio Voice SDK — no phone line needed
- Three-step call setup wizard: mic/speaker test → campaign selection → go live
- Global dialer overlay with ringing, active call, mute, and hangup states
- Real-time agent presence via Socket.IO (go live / offline broadcasts)
- Incoming call TwiML webhook routing on the backend

### Agent Dashboard
- Performance metrics: today's calls, weekly volume, close rate, conversions
- Campaign pricing cards (ACA, Final Expense, Medicare, TV Inbounds)
- Interactive performance chart via Recharts
- Licensed states overview and recent call activity

### Call Management
- Searchable call logs with date filtering
- Call history tracking and status indicators

### Billing & Credits
- Account balance display with low-balance warnings
- Credit purchase interface
- Subscription tiers (Silver / Gold plans)
- Transaction history

### Profile & Settings
- Avatar upload with client-side compression
- Public profile with landing slug and bio
- Integration section: webhook URL + auto-generated API key
- Audio device management (mic/speaker selection, test tone, live meter)
- Account management: update display name, email, password
- Privacy controls: session management, revoke all sessions, data export (JSON)
- Account deletion for password-authenticated users

### Insurance Verticals
- Final Expense
- Spanish Final Expense
- ACA (Affordable Care Act)
- Medicare
- Leads Marketplace

### Additional
- AI-powered support chat (pluggable — mock bot with Gemini integration path)
- Licensed state management (all 50 US states)
- Call scripts page
- Error boundary with graceful fallback UI
- Page-level code splitting with lazy loading
- Animated page transitions

<br />

## Tech Stack

### Frontend

| Technology | Purpose |
|---|---|
| **React 19** | UI framework |
| **Vite 6** | Build tool & dev server |
| **React Router 7** | Client-side routing |
| **Zustand** | Lightweight state management |
| **Framer Motion** | Animations & page transitions |
| **Recharts** | Dashboard charts |
| **Twilio Voice SDK** | Browser-based WebRTC calling |
| **Firebase SDK** | Auth, Firestore, client config |
| **Lucide React** | Icon library |
| **React Hot Toast** | Notification toasts |
| **React Error Boundary** | Graceful error handling |
| **TanStack React Query** | Server state management |
| **Axios** | HTTP client |

### Backend

| Technology | Purpose |
|---|---|
| **Express** | REST API server |
| **Socket.IO** | Real-time agent presence & events |
| **Firebase Admin** | Token verification & session revocation |
| **Twilio** | Voice tokens, TwiML, call routing |
| **Redis** | Agent state & session caching |
| **JSON Web Tokens** | Auth token handling |
| **Multer** | File upload middleware |
| **bcryptjs** | Password hashing |
| **CORS** | Cross-origin configuration |

<br />

## Project Structure

```
agentcalls/
├── backend/
│   ├── src/
│   │   ├── config/            # Firebase Admin, Redis, Twilio clients
│   │   ├── controllers/       # Voice controller (token gen, TwiML)
│   │   ├── middleware/        # Firebase auth middleware
│   │   ├── routes/            # Express route definitions
│   │   ├── services/          # Agent manager logic
│   │   ├── sockets/           # Socket.IO event handlers
│   │   ├── app.js             # Express app configuration
│   │   └── server.js          # Entry point — HTTP + Socket.IO
│   └── package.json
│
├── frontend/
│   ├── public/                # Static assets (ringtone, favicon)
│   ├── src/
│   │   ├── assets/            # Images and media
│   │   ├── components/
│   │   │   ├── layout/        # AppShell, Sidebar, Topbar
│   │   │   └── ui/            # DialerOverlay, PageLoader, ErrorFallback
│   │   ├── config/            # Firebase client initialization
│   │   ├── pages/             # All route-level page components
│   │   ├── services/          # API clients (settings, profile, chat, twilio)
│   │   ├── store/             # Zustand stores (auth, UI, dialer)
│   │   ├── styles/            # Global CSS + CSS Modules
│   │   ├── App.jsx            # Router + route definitions
│   │   └── main.jsx           # React entry point
│   ├── .env                   # Frontend environment variables
│   ├── vite.config.js
│   └── package.json
│
├── architecture/              # Architecture docs & diagrams
├── CLAUDE.md                  # AI agent operating instructions
└── README.md
```

<br />

## API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/voice/token` | Firebase Bearer | Generate Twilio Voice access token for browser SDK |
| `POST` | `/api/voice/incoming-call` | None (Twilio webhook) | Return TwiML for inbound call routing |
| `POST` | `/api/auth/revoke` | Firebase Bearer | Revoke all refresh tokens for the authenticated user |
| `GET` | `/health` | None | Health check — returns `{ status: "Engine Active" }` |

### Socket.IO Events

| Event | Direction | Description |
|---|---|---|
| `agent:go_live` | Client → Server | Agent goes online to receive calls |
| `disconnect` | Client → Server | Agent cleanup on disconnect |
| `stats:agent_count` | Server → Client | Broadcast current online agent count |

<br />

## Getting Started

### Prerequisites

- **Node.js** 18+
- **npm** 9+
- A **Firebase** project with Auth and Firestore enabled
- A **Twilio** account with Voice capabilities and a TwiML App
- (Optional) **Redis** instance for production agent state

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/agentcalls.git
cd agentcalls
```

### 2. Backend Setup

```bash
cd backend
npm install
```

Create a `.env` file in the `backend/` directory:

```env
PORT=3001
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_API_KEY_SID=your_api_key_sid
TWILIO_API_KEY_SECRET=your_api_key_secret
TWILIO_TWIML_APP_SID=your_twiml_app_sid
CLIENT_URL=http://localhost:5173
```

Place your `firebase-service-account.json` in the `backend/` directory.

Start the development server:

```bash
npm run dev
```

The backend runs on `http://localhost:3001`.

### 3. Frontend Setup

```bash
cd frontend
npm install
```

Create a `.env` file in the `frontend/` directory:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_API_URL=http://localhost:3001
VITE_AI_API_KEY=your_gemini_api_key
```

Start the development server:

```bash
npm run dev
```

The frontend runs on `http://localhost:5173`.

### 4. Twilio Configuration

1. Create a TwiML App in your Twilio console
2. Set the Voice Request URL to `https://your-backend-domain/api/voice/incoming-call`
3. Purchase a Twilio phone number and point it to the TwiML App
4. Generate API Keys (SID + Secret) and add them to your backend `.env`

<br />

## Application Routes

### Public

| Route | Page |
|---|---|
| `/` | Landing page |
| `/signup` | Agent registration |
| `/login` | Agent login |

### Authenticated (`/app/*`)

| Route | Page |
|---|---|
| `/app` | Welcome / Home |
| `/app/take-calls` | Go live & receive calls |
| `/app/dashboard` | Performance metrics |
| `/app/call-logs` | Call history |
| `/app/script` | Call scripts |
| `/app/billing` | Credits & subscriptions |
| `/app/licensed-states` | State license management |
| `/app/leads` | Lead marketplace (beta) |
| `/app/profile` | Agent profile & integrations |
| `/app/support` | AI support chat |
| `/app/settings` | Audio, account & privacy settings |

<br />

## Scripts

### Frontend

```bash
npm run dev       # Start Vite dev server
npm run build     # Production build to dist/
npm run preview   # Preview production build
npm run lint      # Run ESLint
```

### Backend

```bash
npm run dev       # Start with nodemon (auto-reload)
npm start         # Start production server
```

<br />

## Environment Variables

### Backend

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default: `3001`) |
| `TWILIO_ACCOUNT_SID` | Yes | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio Auth Token |
| `TWILIO_API_KEY_SID` | Yes | Twilio API Key SID |
| `TWILIO_API_KEY_SECRET` | Yes | Twilio API Key Secret |
| `TWILIO_TWIML_APP_SID` | Yes | Twilio TwiML Application SID |
| `CLIENT_URL` | No | Frontend origin for CORS (default: `*`) |

### Frontend

| Variable | Required | Description |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | Yes | Firebase Web API Key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Yes | Firebase Auth Domain |
| `VITE_FIREBASE_PROJECT_ID` | Yes | Firebase Project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Yes | Firebase Storage Bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Yes | Firebase Messaging Sender ID |
| `VITE_FIREBASE_APP_ID` | Yes | Firebase App ID |
| `VITE_API_URL` | Yes | Backend API base URL |
| `VITE_AI_API_KEY` | No | Google Gemini API key for support chat |

<br />

## Roadmap

- [ ] Stripe payment integration for billing
- [ ] Real-time dashboard with live API data
- [ ] Call recording & playback
- [ ] Agency hierarchy (multi-agent management)
- [ ] Mobile app / PWA support
- [ ] AI-powered call training tools
- [ ] Referral program
- [ ] CRM & lead management
- [ ] Blog / content marketing pages
- [ ] Public pricing page

<br />

## License

This project is proprietary software. All rights reserved.

<br />

<div align="center">

---

Built with purpose for insurance agents who'd rather close than cold call.

**[agentcalls.io](https://agentcalls.io)**

</div>
