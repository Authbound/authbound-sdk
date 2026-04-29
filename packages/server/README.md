# @authbound/server

> Server-side SDK for Authbound identity and age verification with Next.js middleware support.

[![npm version](https://img.shields.io/npm/v/@authbound/server)](https://www.npmjs.com/package/@authbound/server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

`@authbound/server` provides a complete server-side solution for protecting Next.js routes with identity and age verification. It includes:

- **Middleware-based route protection** - Automatically redirect unverified users
- **Encrypted verification context cookies** - Stateless, secure route access state
- **Flexible verification requirements** - Support for identity verification, age gating, and assurance levels
- **Webhook handling** - Automatic verification context updates when verification completes
- **TypeScript-first** - Full type safety with Zod validation

## Installation

```bash
npm install @authbound/server
# or
pnpm add @authbound/server
# or
yarn add @authbound/server
```

**Peer Dependencies:**

- `next >= 14.0.0` (Next.js 15+ recommended)
- `jose >= 5.0.0` (for JWT encryption)

## OpenID4VC Issuance

Use `AuthboundClient` on your server to create credential definitions and OpenID4VCI wallet offers. See the runnable example in [`examples/issuer-agent-basic`](../../examples/issuer-agent-basic).

```typescript
import { AuthboundClient } from "@authbound/server";

const authbound = new AuthboundClient({
  apiKey: process.env.AUTHBOUND_SECRET_KEY!, // sk_test_* or sk_live_*
});

const definition = await authbound.issuer.credentialDefinitions.create({
  credentialDefinitionId: "employee_badge_v1",
  vct: "urn:vc:authbound:employee-badge:1.0",
  format: "dc+sd-jwt",
  title: "Employee Badge",
  claims: [
    { path: ["Employee", "given_name"], mandatory: true },
    { path: ["Employee", "family_name"], mandatory: true },
    { path: ["Employee", "employee_number"], mandatory: true },
  ],
});

const offer = await authbound.openId4Vc.issuance.createOffer({
  credentialDefinitionId: definition.credentialDefinitionId,
  claims: {
    Employee: {
      given_name: "Sergio",
      family_name: "Jack",
      employee_number: "E-1001",
    },
  },
  idempotencyKey: "employee-badge:E-1001",
});

console.log(offer.offerUri);
```

Credential definition metadata is public issuer metadata for wallet discovery. Do not put secrets or personal data in definition titles, aliases, labels, rendering, or metadata.

## Quick Start

### 1. Configure Authbound

Create `authbound.config.ts`:

```typescript
import type { AuthboundConfig } from "@authbound/server/next";

export const authboundConfig: AuthboundConfig = {
  apiKey: process.env.AUTHBOUND_SECRET_KEY!,
  secret: process.env.AUTHBOUND_SECRET!, // Min 32 characters
  routes: {
    protected: [
      { path: "/dashboard", requirements: { verified: true } },
      { path: "/adult-content", requirements: { minAge: 18 } },
    ],
    verify: "/verify",
    callback: "/api/authbound/callback",
  },
};
```

### 2. Set Up Middleware

Create `middleware.ts`:

```typescript
import { authboundMiddleware } from "@authbound/server/next";
import { authboundConfig } from "./authbound.config";

export default authboundMiddleware(authboundConfig);

export const config = {
  matcher: ["/dashboard/:path*", "/adult-content/:path*"],
};
```

### 3. Create API Routes

Create `app/api/authbound/[...authbound]/route.ts`:

```typescript
import { createAuthboundHandlers } from "@authbound/server/next";
import { authboundConfig } from "@/authbound.config";

export const { GET, POST, DELETE } = createAuthboundHandlers(authboundConfig);
```

### 4. Use in Server Components

```typescript
import { cookies } from "next/headers";
import { getVerificationFromToken } from "@authbound/server/next";
import { authboundConfig } from "@/authbound.config";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("__authbound")?.value;

  const verification = token
    ? await getVerificationFromToken(token, authboundConfig.secret)
    : null;

  return (
    <div>
      {verification?.isVerified ? (
        <h1>Welcome, {verification.userRef}!</h1>
      ) : (
        <p>Please verify your identity</p>
      )}
    </div>
  );
}
```

## Features

### Route Protection

Protect routes with flexible requirements:

```typescript
routes: {
  protected: [
    // Basic identity verification
    { path: "/dashboard", requirements: { verified: true } },
    
    // Age gating
    { path: "/adult-content", requirements: { minAge: 18 } },
    
    // Assurance level requirements
    { path: "/premium", requirements: { 
      verified: true, 
      assuranceLevel: "SUBSTANTIAL" 
    }},
    
    // Combined requirements
    { path: "/restricted", requirements: {
      verified: true,
      minAge: 21,
      assuranceLevel: "HIGH"
    }},
  ],
}
```

### Verification Requirements

- **`verified: true`** - Requires identity verification
- **`minAge: number`** - Requires verified age (calculated from DOB)
- **`assuranceLevel: "LOW" | "SUBSTANTIAL" | "HIGH"`** - Requires minimum assurance level

### Verification Context Cookies

Verification context is stored in encrypted JWT cookies:

- **Stateless** - No server-side verification context storage required
- **Encrypted** - AES-256-GCM encryption using `jose`
- **Secure defaults** - HttpOnly, Secure (in production), SameSite=Lax
- **Configurable expiry** - Default 7 days, customizable

### Webhook Integration

Handle verification completion automatically:

```typescript
export const { GET, POST, DELETE } = createAuthboundHandlers(authboundConfig, {
  onWebhook: async (payload) => {
    // Update your database
    await db.users.update({
      where: { id: payload.customer_user_ref },
      data: { verified: payload.status === "VERIFIED" },
    });
    
    // Send notifications
    await sendEmail(payload.customer_user_ref, "Verification complete");
  },
  
  validateWebhookSignature: async (request, payload) => {
    // Validate webhook signature (recommended for production)
    const signature = request.headers.get("x-authbound-signature");
    return verifySignature(signature, payload);
  },
});
```

## API Reference

### `authboundMiddleware(config, options?)`

Creates a Next.js middleware function for route protection.

**Parameters:**

- `config: AuthboundConfig` - Configuration object
- `options?: MiddlewareOptions` - Optional middleware customization

**MiddlewareOptions:**

```typescript
interface MiddlewareOptions {
  // Custom handler when verification is required
  onVerificationRequired?: (request, result) => Response | undefined;
  
  // Hook after verification context validation
  onVerificationValidated?: (request, result) => void | Promise<void>;
  
  // Skip middleware for certain paths
  skip?: (request) => boolean | Promise<boolean>;
}
```

**Example:**

```typescript
export default authboundMiddleware(config, {
  skip: (request) => {
    // Skip for API routes
    return request.nextUrl.pathname.startsWith("/api/");
  },
  
  onVerificationRequired: async (request, result) => {
    // Custom redirect logic
    if (request.nextUrl.pathname.startsWith("/admin")) {
      return NextResponse.redirect("/admin-login");
    }
  },
});
```

### `createAuthboundHandlers(config, options?)`

Creates API route handlers for verification management.

**Returns:**

```typescript
{
  GET: (request) => Promise<NextResponse>;   // Get verification status
  POST: (request) => Promise<NextResponse>;  // Create verification or handle webhook
  DELETE: (request) => Promise<NextResponse>; // Sign out
}
```

**HandlersOptions:**

```typescript
interface HandlersOptions {
  onWebhook?: (payload: WebhookPayload) => void | Promise<void>;
  onVerificationCreated?: (response: CreateVerificationResponse) => void | Promise<void>;
  validateWebhookSignature?: (request, payload) => boolean | Promise<boolean>;
  getUserRef?: (request) => string | Promise<string>;
}
```

### `getVerificationFromCookie(request, config)`

Get verification context from request cookies (for middleware).

```typescript
const verification = await getVerificationFromCookie(request, config);
if (verification?.isVerified) {
  // User is verified
}
```

### `getVerificationFromToken(token, secret)`

Get verification context from JWT token (for server components).

```typescript
const token = cookieStore.get("__authbound")?.value;
const verification = token
  ? await getVerificationFromToken(token, secret)
  : null;
```

### `setVerificationCookie(response, config, verificationData)`

Set a verification cookie on a response.

```typescript
await setVerificationCookie(response, config, {
  userRef: "user_123",
  verificationId: "vrf_456",
  status: "VERIFIED",
  assuranceLevel: "SUBSTANTIAL",
  age: 25,
  dateOfBirth: "1999-01-01",
});
```

### `clearVerificationCookie(response, config)`

Clear the verification cookie.

```typescript
const response = NextResponse.json({ success: true });
clearVerificationCookie(response, config);
return response;
```

## Configuration

### AuthboundConfig

```typescript
interface AuthboundConfig {
  // Required
  apiKey: string;              // Your Authbound API key
  secret: string;              // Secret for JWT encryption (min 32 chars)
  routes: RoutesConfig;        // Route protection configuration
  
  // Optional
  apiUrl?: string;             // Authbound API URL (default: https://api.authbound.io)
  cookie?: CookieOptions;       // Cookie configuration
  debug?: boolean;             // Enable debug logging
}
```

### CookieOptions

```typescript
interface CookieOptions {
  name?: string;               // Cookie name (default: "__authbound")
  maxAge?: number;             // Max age in seconds (default: 604800 = 7 days)
  path?: string;                // Cookie path (default: "/")
  domain?: string;              // Cookie domain
  secure?: boolean;             // Secure flag (default: true in production)
  sameSite?: "strict" | "lax" | "none"; // SameSite (default: "lax")
  httpOnly?: boolean;           // HttpOnly flag (default: true)
}
```

### RoutesConfig

```typescript
interface RoutesConfig {
  protected: ProtectedRouteConfig[];  // Protected routes
  verify: string;                      // Verification page path
  callback?: string;                   // Webhook callback path
}
```

## Security Best Practices

### 1. Secret Management

**✅ DO:**
- Use environment variables for secrets
- Generate strong secrets (min 32 characters)
- Use different secrets per environment

```typescript
secret: process.env.AUTHBOUND_SECRET || generateSecret(),
```

**❌ DON'T:**
- Commit secrets to version control
- Use weak or predictable secrets
- Share secrets between environments

### 2. Webhook Security

**✅ DO:**
- Validate webhook signatures in production
- Verify request origin/IP if possible
- Use HTTPS for webhook endpoints

**Webhook Signature Validation Example:**

```typescript
import crypto from "crypto";
import type { WebhookPayload } from "@authbound/server/next";

async function verifyWebhookSignature(
  request: NextRequest,
  payload: WebhookPayload,
  secret: string
): Promise<boolean> {
  // Get signature from header
  const signature = request.headers.get("x-authbound-signature");
  if (!signature) {
    return false;
  }

  // Create HMAC signature from payload
  const payloadString = JSON.stringify(payload);
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payloadString);
  const expectedSignature = hmac.digest("hex");

  // Compare signatures using constant-time comparison
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Use in handlers
export const { GET, POST, DELETE } = createAuthboundHandlers(config, {
  validateWebhookSignature: async (request, payload) => {
    return verifyWebhookSignature(
      request,
      payload,
      process.env.AUTHBOUND_WEBHOOK_SECRET!
    );
  },
});
```

**IP Allowlist Example:**

```typescript
// Only allow webhooks from Authbound IPs
const AUTHBOUND_IPS = [
  "52.1.2.3", // Example Authbound IP
  "52.4.5.6", // Add your Authbound webhook IPs
];

export const { POST } = createAuthboundHandlers(config, {
  validateWebhookSignature: async (request, payload) => {
    // Check IP address
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ||
               request.ip ||
               "unknown";
    
    if (!AUTHBOUND_IPS.includes(ip)) {
      console.warn(`[Authbound] Rejected webhook from IP: ${ip}`);
      return false;
    }

    // Then validate signature
    return verifyWebhookSignature(request, payload, webhookSecret);
  },
});
```

### 3. Cookie Security

The SDK uses secure defaults, but ensure:

- **Secure flag** is enabled in production
- **HttpOnly** prevents XSS attacks
- **SameSite=Lax** prevents CSRF attacks
- **Domain** is set correctly for multi-domain setups

### 4. Rate Limiting

Consider adding rate limiting for:

- Verification creation endpoints
- Webhook endpoints
- Status check endpoints

**Rate Limiting with `@upstash/ratelimit` Example:**

```bash
npm install @upstash/ratelimit @upstash/redis
```

```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";
import { createAuthboundHandlers } from "@authbound/server/next";
import { authboundConfig } from "@/authbound.config";

// Create rate limiter
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "10 s"), // 10 requests per 10 seconds
  analytics: true,
});

// Create handlers
const handlers = createAuthboundHandlers(authboundConfig);

// Wrap handlers with rate limiting
export async function POST(request: NextRequest) {
  // Get identifier (IP address or user ID)
  const identifier = request.ip || "anonymous";
  
  const { success, limit, reset, remaining } = await ratelimit.limit(
    `authbound:${identifier}`
  );

  if (!success) {
    return NextResponse.json(
      {
        error: "Too many requests",
        limit,
        reset,
        remaining,
      },
      { status: 429 }
    );
  }

  return handlers.POST(request);
}

export const GET = handlers.GET;
export const DELETE = handlers.DELETE;
```

**Rate Limiting with In-Memory Store (Simple Example):**

```typescript
// lib/rate-limit.ts
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  identifier: string,
  limit: number = 10,
  windowMs: number = 10000
): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(identifier, {
      count: 1,
      resetAt: now + windowMs,
    });
    return true;
  }

  if (record.count >= limit) {
    return false;
  }

  record.count++;
  return true;
}

// Usage in route handler
export async function POST(request: NextRequest) {
  const identifier = request.ip || "anonymous";
  
  if (!rateLimit(identifier, 10, 10000)) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 }
    );
  }

  return handlers.POST(request);
}
```

**Recommended Rate Limits:**

- **Verification Creation:** 5-10 requests per minute per IP
- **Status Checks:** 30-60 requests per minute per IP
- **Webhooks:** No limit (validated by signature/IP)
- **Sign Out:** 10-20 requests per minute per IP

### 5. Error Handling

**✅ DO:**
- Log errors securely (don't expose secrets)
- Return generic error messages to clients
- Monitor failed verification attempts

```typescript
onWebhook: async (payload) => {
  try {
    await updateDatabase(payload);
  } catch (error) {
    console.error("[Authbound] Webhook error:", error);
    // Don't expose internal errors
  }
},
```

## Advanced Usage

### Custom Route Matching

Use RegExp for complex route patterns:

```typescript
routes: {
  protected: [
    {
      path: /^\/admin\/.*$/,
      requirements: { verified: true, assuranceLevel: "HIGH" },
    },
  ],
}
```

**Note:** RegExp routes require manual `matcher` configuration in middleware.

### Chaining Middleware

Combine with other middleware:

```typescript
import { chainMiddleware } from "@authbound/server/next";
import { authboundMiddleware } from "@authbound/server/next";
import { myOtherMiddleware } from "@/middleware";

export default chainMiddleware(
  myOtherMiddleware,
  authboundMiddleware(config)
);
```

### Server Component Helpers

Create reusable server component utilities:

```typescript
// lib/authbound.ts
import { cookies } from "next/headers";
import { getVerificationFromToken } from "@authbound/server/next";
import { authboundConfig } from "@/authbound.config";

export async function getAuthboundVerification() {
  const cookieStore = await cookies();
  const token = cookieStore.get("__authbound")?.value;
  
  if (!token) return null;
  
  return getVerificationFromToken(token, authboundConfig.secret);
}

export async function requireVerification() {
  const verification = await getAuthboundVerification();
  
  if (!verification?.isVerified) {
    redirect("/verify");
  }
  
  return verification;
}
```

### Integration with Existing Auth

Link verification to your user system:

```typescript
export const { GET, POST, DELETE } = createAuthboundHandlers(config, {
  getUserRef: async (request) => {
    // Get user from your auth system
    const session = await getServerSession();
    return session?.user?.id;
  },
  
  onWebhook: async (payload) => {
    // Update user record
    await db.user.update({
      where: { id: payload.customer_user_ref },
      data: {
        verified: payload.status === "VERIFIED",
        verificationDate: new Date(),
      },
    });
  },
});
```

## Troubleshooting

### Middleware Not Running

**Problem:** Middleware doesn't execute on protected routes.

**Solution:**
1. Check `matcher` config matches your protected routes
2. Ensure middleware file is in the project root
3. Verify route patterns match exactly

```typescript
export const config = {
  matcher: [
    "/dashboard/:path*",  // Matches /dashboard and /dashboard/*
    "/premium/:path*",
  ],
};
```

### Verification Context Not Persisting

**Problem:** Verification cookie isn't being set or read.

**Solution:**
1. Check cookie name matches in config and reading code
2. Verify cookie domain/path settings
3. Ensure HTTPS in production (required for Secure cookies)
4. Check browser console for cookie errors

### Webhook Not Received

**Problem:** Webhook callback isn't being called.

**Solution:**
1. Verify callback URL is publicly accessible
2. Check webhook URL in Authbound dashboard
3. Ensure route handler is correctly set up
4. Check server logs for incoming requests

### Type Errors

**Problem:** TypeScript errors with configuration.

**Solution:**
1. Ensure `AuthboundConfig` type is imported correctly
2. Use `parseConfig()` to validate at runtime
3. Check Zod schema validation errors

```typescript
import { parseConfig } from "@authbound/server/next";

const config = parseConfig({
  // ... config
});
```

## Examples

See the [Next.js example app](../../examples/next-example) for a complete implementation.

## API Compatibility

- **Next.js:** 14.0.0+ (15+ recommended)
- **Node.js:** 18.0.0+
- **Edge Runtime:** Supported (uses `jose` for edge compatibility)

## Contributing

Contributions are welcome! Please read our [contributing guidelines](../../CONTRIBUTING.md) first.

## License

MIT © [Authbound](https://authbound.com)

## Support

- [Documentation](https://docs.authbound.com)
- [GitHub Issues](https://github.com/authbound/sdk/issues)
- [Discord Community](https://discord.gg/authbound)
