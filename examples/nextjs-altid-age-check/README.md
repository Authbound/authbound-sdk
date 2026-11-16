# Authbound AltID age check example

Next.js App Router example that asks Denmark's AltID app to prove a person is 18 or older. It is the runnable copy of the code in the [AltID guide](https://docs.authbound.io/verify/altid).

Everything that talks to Authbound runs on the server. The browser gets the AltID link and a one-word state, never claims, tokens or verification IDs. Each check is tied to the browser that started it by an HttpOnly cookie, and a passed check sets a signed cookie that 18+ pages gate on.

| File | What it does |
| --- | --- |
| `lib/altid.ts` | Starts, reads and cancels a check, and verifies the signed result |
| `lib/age-session.ts` | The check cookie and the signed "over 18" cookie |
| `app/api/age-check/route.ts` | `POST` starts this browser's check, `GET` reads its state, `DELETE` cancels it |
| `app/page.tsx` | Shows a QR code on desktop or a link on a phone, and polls until AltID answers |
| `app/adult/page.tsx` | 18+ content, shown only with a valid signed cookie |

## Setup

From the repository root, install and build the SDK packages:

```bash
pnpm install
pnpm build
```

Then copy `.env.example` to `.env.local` in this folder and fill it in:

```env
AUTHBOUND_SECRET_KEY=sk_test_...
AUTHBOUND_API_URL=https://sandbox.authbound.io
AUTHBOUND_ALTID_POLICY_ID=pol_age_over_18_altid_test_v1
AGE_CHECK_COOKIE_SECRET=replace-with-32-random-bytes
```

Use a test secret key. `https://sandbox.authbound.io` is the test host and accepts only test keys. `pol_age_over_18_altid_test_v1` accepts the AltID app and the AltID test app; in production use `pol_age_over_18_altid_v1` with a live key and `https://edge.authbound.io`. Generate the cookie secret with `openssl rand -base64 32`.

## Run

```bash
pnpm --filter nextjs-altid-age-check dev
```

Open `http://localhost:3120` and scan the QR code with AltID.

## Use the code in your own app

Outside this repository, install the SDK from npm and copy the files above:

```bash
npm install @authbound/server qrcode
npm install --save-dev @types/qrcode
```

## Checks

```bash
pnpm --filter nextjs-altid-age-check typecheck
pnpm --filter nextjs-altid-age-check build
```
