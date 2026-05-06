# Authbound Next.js Example

This example demonstrates how to integrate the Authbound Server SDK with a Next.js application to implement identity and age verification with middleware-based route protection.

## Features

- **Middleware-based route protection** - Automatically redirect unauthenticated users
- **Age verification** - Gate content based on verified age
- **Assurance levels** - Different requirements for different routes
- **Encrypted JWT cookies** - Stateless session management
- **Same-origin session finalization** - Browser creates the SDK session after verified status
- **Webhook handling** - Backend reconciliation for verification events

## Getting Started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

Copy the example environment file:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your Authbound credentials:

```env
AUTHBOUND_SECRET_KEY=sk_test_...
AUTHBOUND_SESSION_SECRET=your-session-secret-at-least-32-characters
AUTHBOUND_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_AUTHBOUND_PK=pk_test_...
NEXT_PUBLIC_AUTHBOUND_POLICY_ID=pol_authbound_pension_v1
```

### 3. Run the development server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   └── authbound/
│   │       └── [...authbound]/
│   │           └── route.ts    # API handlers for session, callback, status
│   ├── dashboard/
│   │   └── page.tsx            # Protected: requires verified identity
│   ├── premium/
│   │   └── page.tsx            # Protected: requires SUBSTANTIAL assurance
│   ├── adult/
│   │   └── page.tsx            # Protected: requires age 18+
│   ├── members/
│   │   └── page.tsx            # Protected: requires LOW assurance
│   ├── verify/
│   │   └── page.tsx            # Verification flow page
│   ├── layout.tsx
│   ├── page.tsx                # Public home page
│   └── globals.css
├── authbound.config.ts         # SDK configuration
└── middleware.ts               # Authbound middleware
```

## Configuration

### Route Protection

Configure protected routes in `authbound.config.ts`:

```typescript
routes: {
  protected: [
    // Basic verification
    { path: '/dashboard', requirements: { verified: true } },
    
    // Higher assurance level
    { path: '/premium', requirements: { verified: true, assuranceLevel: 'SUBSTANTIAL' } },
    
    // Age verification
    { path: '/adult', requirements: { minAge: 18 } },
  ],
  verify: '/verify',
  callback: '/api/authbound/webhook',
}
```

### Middleware Matcher

Update the middleware matcher to include your protected routes:

```typescript
// middleware.ts
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/premium/:path*',
    '/adult/:path*',
  ],
};
```

## API Routes

The SDK provides a catch-all API route handler that manages:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/authbound/verification` | POST | Create a new verification |
| `/api/authbound/session` | POST | Verify client token/status and set the HttpOnly SDK cookie |
| `/api/authbound/webhook` | POST | Webhook receiver for backend reconciliation |
| `/api/authbound/status` | GET | Get current verification status |
| `/api/authbound` | DELETE | Sign out (clear session cookie) |

## How It Works

1. **User visits protected route** → Middleware checks for valid session cookie
2. **No valid session** → Redirect to `/verify?returnTo=/original-path`
3. **User completes verification** → Browser status flow calls `/api/authbound/session`
4. **User revisits protected route** → Middleware validates cookie and allows access

## Security

- Session data is stored in an encrypted JWT cookie (AES-256-GCM)
- Cookies are HttpOnly, Secure (in production), and SameSite=Lax
- No server-side session storage required (stateless)
- Webhooks require signature validation by default

## Learn More

- [Authbound Documentation](https://docs.authbound.com)
- [Next.js Middleware](https://nextjs.org/docs/app/building-your-application/routing/middleware)
- [@authbound/server API Reference](../../packages/server/README.md)
