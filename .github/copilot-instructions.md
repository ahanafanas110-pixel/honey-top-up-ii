# Project Guidelines

## Stack & Setup
- Use Bun as the package manager (`bun.lock` is present) and follow ESLint rules (`eslint.config.js`).
- Follow existing Firebase / Firestore configuration and security rules (`firebase-applet-config.json`, `firestore.rules`).
- Keep code inside `src/` modular, clean, and well-typed.

## Coding & Editing Rules
- You have permission to inspect, refactor, and update files across this repository when asked.
- Never expose API keys, secrets, or `.env` values; reference `.env.example` when environment variables are needed.
- Prefer clean, mobile-first UI and clear error handling.
