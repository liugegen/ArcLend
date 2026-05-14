/**
 * Circle API Backend Route — Hardened Implementation
 *
 * Proxies requests to Circle's User Controlled Wallets API.
 * CIRCLE_API_KEY is server-side only.
 */

import { NextResponse } from 'next/server';

// ─── Environment ────────────────────────────────────────────────────────────

const CIRCLE_BASE_URL =
  process.env.NEXT_PUBLIC_CIRCLE_BASE_URL || 'https://api.circle.com';
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY || '';

console.log(
  `[api/circle] module loaded | baseUrl=${CIRCLE_BASE_URL} | apiKeySet=${!!CIRCLE_API_KEY}`,
);

// ─── Helpers ────────────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function circleRequest(
  path: string,
  method: 'GET' | 'POST',
  userToken?: string,
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = `${CIRCLE_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${CIRCLE_API_KEY}`,
  };
  if (userToken) {
    headers['X-User-Token'] = userToken;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : 'Unknown fetch error';
    console.error(`[api/circle] fetch failed: ${method} ${url} — ${msg}`);
    throw new Error(`Circle API request failed: ${msg}`);
  }
}

// ─── Route Handler ──────────────────────────────────────────────────────────

export async function POST(request: Request) {
  console.log('[api/circle] POST handler entered');

  // Guard: API key
  if (!CIRCLE_API_KEY) {
    console.error('[api/circle] CIRCLE_API_KEY is not set');
    return errorResponse('CIRCLE_API_KEY is not configured on the server', 500);
  }

  // Parse body
  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    console.log(`[api/circle] body length=${text.length}`);
    body = JSON.parse(text);
  } catch (err) {
    console.error('[api/circle] failed to parse request body:', err);
    return errorResponse('Invalid JSON body', 400);
  }

  const action = body.action as string | undefined;
  console.log(`[api/circle] action=${action}`);

  if (!action) {
    return errorResponse('Missing action', 400);
  }

  try {
    switch (action) {
      // ─── createDeviceToken ──────────────────────────────────────────────
      case 'createDeviceToken': {
        const deviceId = body.deviceId as string;
        if (!deviceId) return errorResponse('Missing deviceId', 400);

        console.log('[api/circle] createDeviceToken — calling Circle');
        const result = await circleRequest(
          '/v1/w3s/users/social/token',
          'POST',
          undefined,
          { idempotencyKey: crypto.randomUUID(), deviceId },
        );

        if (!result.ok) {
          console.log(`[api/circle] createDeviceToken — Circle returned ${result.status}`);
          return jsonResponse(result.data, result.status);
        }

        const responseData = result.data as Record<string, unknown>;
        return jsonResponse(responseData.data ?? responseData, 200);
      }

      // ─── initializeUser ─────────────────────────────────────────────────
      case 'initializeUser': {
        const userToken = body.userToken as string;
        if (!userToken) return errorResponse('Missing userToken', 400);

        console.log('[api/circle] initializeUser — calling Circle');
        const result = await circleRequest(
          '/v1/w3s/user/initialize',
          'POST',
          userToken,
          {
            idempotencyKey: crypto.randomUUID(),
            accountType: 'SCA',
            blockchains: ['ARC-TESTNET'],
          },
        );

        if (!result.ok) {
          console.log(`[api/circle] initializeUser — Circle returned ${result.status}`);
          return jsonResponse(result.data, result.status);
        }

        const responseData = result.data as Record<string, unknown>;
        return jsonResponse(responseData.data ?? responseData, 200);
      }

      // ─── listWallets ────────────────────────────────────────────────────
      case 'listWallets': {
        const userToken = body.userToken as string;
        if (!userToken) return errorResponse('Missing userToken', 400);

        console.log('[api/circle] listWallets — calling Circle');
        const result = await circleRequest('/v1/w3s/wallets', 'GET', userToken);

        if (!result.ok) {
          console.log(`[api/circle] listWallets — Circle returned ${result.status}`);
          return jsonResponse(result.data, result.status);
        }

        const responseData = result.data as Record<string, unknown>;
        return jsonResponse(responseData.data ?? responseData, 200);
      }

      // ─── getTokenBalance ────────────────────────────────────────────────
      case 'getTokenBalance': {
        const userToken = body.userToken as string;
        const walletId = body.walletId as string;
        if (!userToken || !walletId) {
          return errorResponse('Missing userToken or walletId', 400);
        }

        console.log('[api/circle] getTokenBalance — calling Circle');
        const result = await circleRequest(
          `/v1/w3s/wallets/${walletId}/balances`,
          'GET',
          userToken,
        );

        if (!result.ok) {
          console.log(`[api/circle] getTokenBalance — Circle returned ${result.status}`);
          return jsonResponse(result.data, result.status);
        }

        const responseData = result.data as Record<string, unknown>;
        return jsonResponse(responseData.data ?? responseData, 200);
      }

      // ─── createContractExecution ────────────────────────────────────────
      case 'createContractExecution': {
        const userToken = body.userToken as string;
        const walletId = body.walletId as string;
        const contractAddress = body.contractAddress as string;
        const callData = body.callData as string;
        const feeLevel = (body.feeLevel as string) || 'MEDIUM';

        if (!userToken || !walletId || !contractAddress || !callData) {
          return errorResponse(
            'Missing required params: userToken, walletId, contractAddress, callData',
            400,
          );
        }

        console.log(
          `[api/circle] createContractExecution — contract=${contractAddress.slice(0, 10)}... wallet=${walletId.slice(0, 8)}...`,
        );

        const result = await circleRequest(
          '/v1/w3s/user/transactions/contractExecution',
          'POST',
          userToken,
          {
            idempotencyKey: crypto.randomUUID(),
            walletId,
            contractAddress,
            callData,
            feeLevel,
          },
        );

        console.log(`[api/circle] createContractExecution — Circle returned ${result.status}`);

        if (!result.ok) {
          return jsonResponse(result.data, result.status);
        }

        const responseData = result.data as Record<string, unknown>;
        return jsonResponse(responseData.data ?? responseData, 200);
      }

      // ─── getTransaction ─────────────────────────────────────────────────
      case 'getTransaction': {
        const userToken = body.userToken as string;
        const transactionId = body.transactionId as string;
        if (!userToken || !transactionId) {
          return errorResponse('Missing userToken or transactionId', 400);
        }

        console.log(`[api/circle] getTransaction — id=${transactionId.slice(0, 8)}...`);
        const result = await circleRequest(
          `/v1/w3s/transactions/${transactionId}`,
          'GET',
          userToken,
        );

        if (!result.ok) {
          return jsonResponse(result.data, result.status);
        }

        const responseData = result.data as Record<string, unknown>;
        return jsonResponse(responseData.data ?? responseData, 200);
      }

      // ─── Unknown action ─────────────────────────────────────────────────
      default:
        console.log(`[api/circle] unknown action: ${action}`);
        return errorResponse(`Unknown action: ${action}`, 400);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error(`[api/circle] unhandled error in action=${action}:`, err);
    return errorResponse(message, 500);
  }
}

// Also export GET for health check / route verification
export async function GET() {
  return jsonResponse({
    status: 'ok',
    route: '/api/circle',
    apiKeyConfigured: !!CIRCLE_API_KEY,
    baseUrl: CIRCLE_BASE_URL,
    timestamp: Date.now(),
  });
}
