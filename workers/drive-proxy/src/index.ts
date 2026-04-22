/// <reference types="@cloudflare/workers-types" />

export interface Env {
  ALLOWED_ORIGIN: string;
  FIREBASE_PROJECT_ID: string;
  GOOGLE_OAUTH_CLIENT_ID: string;
  GOOGLE_OAUTH_CLIENT_SECRET: string;
  GOOGLE_SERVICE_ACCOUNT: string;
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

// ── JWT / OAuth2 (Firebase service account) ──────────────────────────────────

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function encodeObj(obj: object): string {
  return btoa(JSON.stringify(obj))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getFirebaseAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeObj({ alg: 'RS256', typ: 'JWT' });
  const payload = encodeObj({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  });
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${base64url(sig)}`;
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await resp.json() as { access_token: string };
  return data.access_token;
}

// ── Firestore REST ────────────────────────────────────────────────────────────

type FsFieldValue =
  | { stringValue: string }
  | { integerValue: string }
  | { booleanValue: boolean }
  | { nullValue: null };

function toFsValue(v: unknown): FsFieldValue {
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') return { integerValue: String(Math.floor(v)) };
  if (typeof v === 'boolean') return { booleanValue: v };
  return { nullValue: null };
}

function fsValue(v: Record<string, unknown>): unknown {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('booleanValue' in v) return v.booleanValue;
  return null;
}

function parseDoc(doc: Record<string, unknown>): Record<string, unknown> {
  const fields = (doc.fields as Record<string, Record<string, unknown>>) ?? {};
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fsValue(v)]));
}

async function firestoreGet(
  projectId: string,
  token: string,
  path: string,
): Promise<Record<string, unknown> | null> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) return null;
  return resp.json() as Promise<Record<string, unknown>>;
}

async function firestoreSet(
  projectId: string,
  token: string,
  path: string,
  data: Record<string, unknown>,
): Promise<void> {
  const fields: Record<string, FsFieldValue> = {};
  for (const [k, v] of Object.entries(data)) {
    fields[k] = toFsValue(v);
  }
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
  await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
  };
}

function json(cors: Record<string, string>, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function jsonError(cors: Record<string, string>, msg: string, status: number): Response {
  return json(cors, { error: msg }, status);
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleStream(
  request: Request,
  cors: Record<string, string>,
  fileId: string,
): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token) return jsonError(cors, 'Unauthorized', 401);

  const driveUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  const range = request.headers.get('Range');
  if (range) headers['Range'] = range;

  const resp = await fetch(driveUrl, { headers });
  const respHeaders: Record<string, string> = { ...cors };
  for (const h of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges']) {
    const v = resp.headers.get(h);
    if (v) respHeaders[h] = v;
  }
  if (!respHeaders['Content-Type']) respHeaders['Content-Type'] = 'video/mp4';

  return new Response(resp.body, { status: resp.status, headers: respHeaders });
}

async function handleExchange(
  request: Request,
  env: Env,
  cors: Record<string, string>,
): Promise<Response> {
  let code: string, uid: string, redirectUri: string;
  try {
    const body = await request.json() as { code?: string; uid?: string; redirectUri?: string };
    code = body.code ?? '';
    uid = body.uid ?? '';
    redirectUri = body.redirectUri ?? 'postmessage';
  } catch {
    return jsonError(cors, 'Invalid JSON', 400);
  }
  if (!code || !uid) return jsonError(cors, 'Missing code or uid', 400);

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenResp.ok) {
    const err = await tokenResp.text();
    console.error('Token exchange failed:', err);
    return jsonError(cors, 'Token exchange failed', 500);
  }

  const tokens = await tokenResp.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  if (!tokens.refresh_token) {
    return jsonError(cors, 'No refresh token returned', 500);
  }

  const sa: ServiceAccount = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT);
  const firebaseToken = await getFirebaseAccessToken(sa);
  await firestoreSet(env.FIREBASE_PROJECT_ID, firebaseToken, `users/${uid}/videocollect/auth`, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenExpiry: Date.now() + tokens.expires_in * 1000,
  });

  return json(cors, { success: true });
}

async function handleRefresh(
  request: Request,
  env: Env,
  cors: Record<string, string>,
): Promise<Response> {
  let uid: string;
  try {
    const body = await request.json() as { uid?: string };
    uid = body.uid ?? '';
  } catch {
    return jsonError(cors, 'Invalid JSON', 400);
  }
  if (!uid) return jsonError(cors, 'Missing uid', 400);

  const sa: ServiceAccount = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT);
  const firebaseToken = await getFirebaseAccessToken(sa);
  const authDoc = await firestoreGet(env.FIREBASE_PROJECT_ID, firebaseToken, `users/${uid}/videocollect/auth`);
  if (!authDoc) return jsonError(cors, 'Not connected', 401);

  const parsed = parseDoc(authDoc);
  const refreshToken = parsed.refreshToken as string | undefined;
  if (!refreshToken) return jsonError(cors, 'No refresh token', 401);

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });

  if (!tokenResp.ok) {
    console.error('Token refresh failed:', await tokenResp.text());
    return jsonError(cors, 'Refresh failed', 500);
  }

  const tokens = await tokenResp.json() as {
    access_token: string;
    expires_in: number;
  };
  const tokenExpiry = Date.now() + tokens.expires_in * 1000;

  await firestoreSet(env.FIREBASE_PROJECT_ID, firebaseToken, `users/${uid}/videocollect/auth`, {
    accessToken: tokens.access_token,
    refreshToken,
    tokenExpiry,
  });

  return json(cors, { accessToken: tokens.access_token, tokenExpiry });
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(env.ALLOWED_ORIGIN);

    try {
      const url = new URL(request.url);

      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: cors });
      }

      const streamMatch = url.pathname.match(/^\/stream\/([^/]+)$/);
      if (streamMatch && request.method === 'GET') {
        return handleStream(request, cors, streamMatch[1]);
      }

      if (url.pathname === '/oauth/exchange' && request.method === 'POST') {
        return handleExchange(request, env, cors);
      }

      if (url.pathname === '/oauth/refresh' && request.method === 'POST') {
        return handleRefresh(request, env, cors);
      }

      return new Response('Not Found', { status: 404, headers: cors });
    } catch (e) {
      console.error('Worker error:', e);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
  },
};
