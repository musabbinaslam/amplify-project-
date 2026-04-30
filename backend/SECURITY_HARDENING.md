# Security Hardening Checklist (Stage and Production)

Apply all steps to stage first, validate, then repeat in production with different secrets.

## 1) Firebase rules

From `backend/`:

```bash
firebase use <stage-project-id>
firebase deploy --only firestore:rules,storage
```

Then repeat for production:

```bash
firebase use <prod-project-id>
firebase deploy --only firestore:rules,storage
```

## 2) Firebase API key restrictions

In Google Cloud Console for each project:
- APIs & Services -> Credentials -> select web key.
- Application restrictions -> HTTP referrers.
- Add only your domain(s), for example:
  - `https://stage.callsflow.io/*`
  - `https://callsflow.io/*`
- API restrictions -> Restrict key -> select only required Firebase APIs.

## 3) App Check

In Firebase Console for each project:
- App Check -> register your web app.
- Start in monitor mode.
- Verify traffic is healthy.
- Enforce for Firestore and Storage.

## 4) Backend environment variables

Set unique values per environment:
- `TRACKDRIVE_WEBHOOK_SECRET`
- `RATE_LIMIT_PUBLIC_PING_WINDOW_MS`
- `RATE_LIMIT_PUBLIC_PING_MAX`
- `RATE_LIMIT_TRACKDRIVE_WEBHOOK_WINDOW_MS`
- `RATE_LIMIT_TRACKDRIVE_WEBHOOK_MAX`
- `FIREBASE_CONFIG_ALLOWED_ORIGINS`

Example:

```env
FIREBASE_CONFIG_ALLOWED_ORIGINS=https://stage.callsflow.io,https://callsflow.io
```

## 5) Service account safety

- Keep `backend/firebase-service-account.json` out of git.
- Never place this file in any public web root.
- Rotate credentials immediately if exposed.
