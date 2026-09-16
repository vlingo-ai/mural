# Mural Web

Phase 5 browser client for the same Mural API used by the native apps. The browser never receives
a Model Gateway or OpenAI credential. The current development access token is held in React memory
only and is intentionally cleared by a page reload; production identity UI is a later Phase 5 slice.

## Local development

1. Configure the API with `MURAL_WEB_ALLOWED_ORIGINS=http://127.0.0.1:5173` and start it on
   `127.0.0.1:8080`.
2. Copy `.env.example` to `.env.local` only if the API uses another local origin.
3. Run `npm install --ignore-scripts`, then `npm run dev`.
4. Paste a short-lived Mural account or guest bearer into the development field. Do not paste an
   OpenAI or Model Gateway key.

The browser creates a WebRTC offer locally, sends only the SDP and public language identity to
`POST /v1/live/sessions`, then applies the returned answer. Audio continues over WebRTC; the Mural
API and Model Gateway remain the control, policy and accounting boundary.

## Checks

```sh
npm test
npm run build
```
