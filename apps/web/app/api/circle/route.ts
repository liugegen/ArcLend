/**
 * Circle API Backend Route
 *
 * This route proxies requests to Circle's User Controlled Wallets API.
 * The CIRCLE_API_KEY is kept server-side only — never exposed to the browser.
 *
 * Supported actions:
 * - createDeviceToken: Exchange deviceId for deviceToken + deviceEncryptionKey
 * - initializeUser: Initialize a user and get a challengeId for wallet creation
 * - listWallets: List wallets for an authenticated user
 * - getTokenBalance: Get token balances for a specific wallet
 *
 * Migration note: The previous implementation called a non-existent
 * POST /wallets/authenticate endpoint directly from the browser. Circle's
 * User Controlled Wallets architecture requires:
 * 1. Server-side calls with the API key (this route)
 * 2. Client-side SDK (@circle-fin/w3s-pw-web-sdk) for social login + challenges
 */

import { NextResponse } from 'next/server';

const CIRCLE_BASE_URL =
  process.env.NEXT_PUBLIC_CIRCLE_BASE_URL ?? 'https://api.circle.com';
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY;

export async function POST(request: Request) {
  if (!CIRCLE_API_KEY) {
    return NextResponse.json(
      { error: 'CIRCLE_API_KEY is not configured on the server' },
      { status: 500 },
    );
  }

  try {
    const body = await request.json();
    const { action, ...params } = body ?? {};

    if (!action) {
      return NextResponse.json({ error: 'Missing action' }, { status: 400 });
    }

    switch (action) {
      // ─── Create Device Token ────────────────────────────────────────────
      // Exchanges a browser-generated deviceId for a deviceToken and
      // deviceEncryptionKey used by the Web SDK for social login.
      case 'createDeviceToken': {
        const { deviceId } = params;
        if (!deviceId) {
          return NextResponse.json(
            { error: 'Missing deviceId' },
            { status: 400 },
          );
        }

        const response = await fetch(
          `${CIRCLE_BASE_URL}/v1/w3s/users/social/token`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${CIRCLE_API_KEY}`,
            },
            body: JSON.stringify({
              idempotencyKey: crypto.randomUUID(),
              deviceId,
            }),
          },
        );

        const data = await response.json();

        if (!response.ok) {
          return NextResponse.json(data, { status: response.status });
        }

        return NextResponse.json(data.data, { status: 200 });
      }

      // ─── Initialize User ────────────────────────────────────────────────
      // Creates or initializes a Circle user and returns a challengeId
      // for wallet creation. If user is already initialized, Circle returns
      // error code 155106.
      case 'initializeUser': {
        const { userToken } = params;
        if (!userToken) {
          return NextResponse.json(
            { error: 'Missing userToken' },
            { status: 400 },
          );
        }

        const response = await fetch(
          `${CIRCLE_BASE_URL}/v1/w3s/user/initialize`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${CIRCLE_API_KEY}`,
              'X-User-Token': userToken,
            },
            body: JSON.stringify({
              idempotencyKey: crypto.randomUUID(),
              accountType: 'SCA',
              blockchains: ['ARC-TESTNET'],
            }),
          },
        );

        const data = await response.json();

        if (!response.ok) {
          return NextResponse.json(data, { status: response.status });
        }

        return NextResponse.json(data.data, { status: 200 });
      }

      // ─── List Wallets ───────────────────────────────────────────────────
      case 'listWallets': {
        const { userToken } = params;
        if (!userToken) {
          return NextResponse.json(
            { error: 'Missing userToken' },
            { status: 400 },
          );
        }

        const response = await fetch(`${CIRCLE_BASE_URL}/v1/w3s/wallets`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${CIRCLE_API_KEY}`,
            'X-User-Token': userToken,
          },
        });

        const data = await response.json();

        if (!response.ok) {
          return NextResponse.json(data, { status: response.status });
        }

        return NextResponse.json(data.data, { status: 200 });
      }

      // ─── Get Token Balance ──────────────────────────────────────────────
      case 'getTokenBalance': {
        const { userToken, walletId } = params;
        if (!userToken || !walletId) {
          return NextResponse.json(
            { error: 'Missing userToken or walletId' },
            { status: 400 },
          );
        }

        const response = await fetch(
          `${CIRCLE_BASE_URL}/v1/w3s/wallets/${walletId}/balances`,
          {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${CIRCLE_API_KEY}`,
              'X-User-Token': userToken,
            },
          },
        );

        const data = await response.json();

        if (!response.ok) {
          return NextResponse.json(data, { status: response.status });
        }

        return NextResponse.json(data.data, { status: 200 });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error('[/api/circle] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
