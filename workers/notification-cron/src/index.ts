export interface Env {
  GOOGLE_SERVICE_ACCOUNT: string; // Service account JSON (Cloudflare Secret)
  FIREBASE_PROJECT_ID: string;
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

interface TimetableEvent {
  pi: number;
  name: string;
  room: string;
}

interface Period {
  label: string;
  start: string;
  end: string;
}

// ── JWT / OAuth2 ─────────────────────────────────────────

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

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeObj({ alg: 'RS256', typ: 'JWT' });
  const payload = encodeObj({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore',
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
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${base64url(sig)}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await resp.json() as { access_token: string };
  return data.access_token;
}

// ── Firestore REST ────────────────────────────────────────

async function firestoreGet(
  projectId: string,
  token: string,
  path: string,
): Promise<Record<string, unknown> | null> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return null;
  return await resp.json() as Record<string, unknown>;
}

// push サブコレクション内の全トークンドキュメントを collectionGroup で取得
async function firestoreQueryPushTokens(
  projectId: string,
  token: string,
): Promise<Record<string, unknown>[]> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'push', allDescendants: true }],
      },
    }),
  });
  if (!resp.ok) return [];
  const results = await resp.json() as { document?: Record<string, unknown> }[];
  return results.flatMap(r => r.document ? [r.document] : []);
}

// Firestore の値フィールドを JS の値に変換
function fsValue(v: Record<string, unknown>): unknown {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('mapValue' in v) {
    const fields = (v.mapValue as { fields: Record<string, Record<string, unknown>> }).fields ?? {};
    return Object.fromEntries(Object.entries(fields).map(([k, val]) => [k, fsValue(val)]));
  }
  if ('arrayValue' in v) {
    const values = (v.arrayValue as { values?: Record<string, unknown>[] }).values ?? [];
    return values.map(fsValue);
  }
  return null;
}

function parseDoc(doc: Record<string, unknown>): Record<string, unknown> {
  const fields = (doc.fields as Record<string, Record<string, unknown>>) ?? {};
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fsValue(v)]));
}

// ── FCM 送信 ──────────────────────────────────────────────

async function sendFcm(
  projectId: string,
  token: string,
  fcmToken: string,
  title: string,
  body: string,
): Promise<void> {
  await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: fcmToken,
          apns: {
            payload: {
              aps: {
                alert: { title, body },
                badge: 1,
              },
            },
          },
          webpush: {
            notification: { title, body, icon: '/vite.svg' },
          },
        },
      }),
    },
  );
}

// ── 時刻ユーティリティ ────────────────────────────────────

function timeToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function todayKey(): string {
  const now = new Date();
  // JST (UTC+9)
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function nowMinJst(): number {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.getUTCHours() * 60 + jst.getUTCMinutes();
}

// ── メイン ────────────────────────────────────────────────

export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const sa: ServiceAccount = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT);
    const accessToken = await getAccessToken(sa);
    const projectId = env.FIREBASE_PROJECT_ID;

    const dateKey = todayKey();
    const nowMin = nowMinJst();

    // push サブコレクションを collectionGroup で直接取得
    const pushDocs = await firestoreQueryPushTokens(projectId, accessToken);

    for (const pushDoc of pushDocs) {
      // users/{uid}/push/token のパスから uid を取得
      const name = pushDoc.name as string;
      const segments = name.split('/');
      const uid = segments[segments.indexOf('users') + 1];
      if (!uid) continue;

      const push = parseDoc(pushDoc);
      const fcmToken = push.token as string;
      const notifyBefore = (push.notifyBefore as number) ?? 10;

      // 時間割データを取得
      const timetableDoc = await firestoreGet(projectId, accessToken, `users/${uid}/timetable/data`);
      if (!timetableDoc) continue;
      const timetable = parseDoc(timetableDoc);
      const events = (timetable.events as Record<string, TimetableEvent[]>) ?? {};
      const periods = (timetable.periods as Period[]) ?? [];

      const todayEvents = events[dateKey] ?? [];
      for (const ev of todayEvents) {
        const period = periods[ev.pi];
        if (!period) continue;

        const notifyAt = timeToMin(period.start) - notifyBefore;
        if (nowMin === notifyAt) {
          const body = `${period.label} ${ev.name}${ev.room ? `（${ev.room}）` : ''} ${period.start}〜`;
          await sendFcm(projectId, accessToken, fcmToken, `${notifyBefore}分後に授業があります`, body);
        }
      }
    }
  },
};
