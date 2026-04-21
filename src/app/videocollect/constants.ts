export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  modifiedTime: string;
  thumbnailLink?: string;
  videoMediaMetadata?: {
    width?: number;
    height?: number;
    durationMillis?: string;
  };
};

export type DriveFolder = { id: string; name: string };

export type VcData = {
  folders: DriveFolder[];
  tags: Record<string, string[]>;
};

export type VcAuth = {
  accessToken: string;
  refreshToken: string;
  tokenExpiry: number;
};

export const VC_INITIAL_DATA: VcData = { folders: [], tags: {} };

export const firestorePaths = {
  vcData: (uid: string) => `users/${uid}/videocollect/data`,
  vcAuth: (uid: string) => `users/${uid}/videocollect/auth`,
} as const;

export function parseVcData(raw: Record<string, unknown>): VcData {
  const folders = Array.isArray(raw.folders)
    ? (raw.folders as unknown[])
        .map(f => {
          const folder = f as Record<string, unknown>;
          return { id: (folder.id as string) ?? '', name: (folder.name as string) ?? '' };
        })
        .filter(f => f.id)
    : [];
  const rawTags = raw.tags as Record<string, unknown> | undefined;
  const tags: Record<string, string[]> = {};
  if (rawTags) {
    for (const [k, v] of Object.entries(rawTags)) {
      if (Array.isArray(v)) tags[k] = v.filter((t): t is string => typeof t === 'string');
    }
  }
  return { folders, tags };
}

export const VC_ERROR_CODES = {
  AUTH_FAILED: 'E021',
  FILES_FETCH: 'E022',
  FOLDERS_FETCH: 'E023',
  TOKEN_REFRESH: 'E024',
  UPLOAD_FAILED: 'E025',
  TAG_SAVE: 'E026',
} as const;

export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
].join(' ');

export const DRIVE_FILES_FIELDS =
  'id,name,mimeType,size,modifiedTime,thumbnailLink,videoMediaMetadata';

export function formatSize(bytes: string): string {
  const n = parseInt(bytes, 10);
  if (isNaN(n)) return '';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${Math.round(n / 1e3)} KB`;
}

export function formatDuration(ms: string): string {
  const secs = Math.floor(parseInt(ms, 10) / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatTime(s: number): string {
  if (isNaN(s) || !isFinite(s)) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Drive API から全ページを取得してマージ */
export async function fetchAllDriveFiles(
  accessToken: string,
  q: string,
): Promise<DriveFile[]> {
  const allFiles: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q,
      fields: `nextPageToken,files(${DRIVE_FILES_FIELDS})`,
      pageSize: '1000',
      orderBy: 'modifiedTime desc',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!resp.ok) throw new Error(`Drive API error: ${resp.status}`);
    const data = await resp.json() as { files?: DriveFile[]; nextPageToken?: string };
    allFiles.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allFiles;
}

/** Drive API からフォルダ一覧を取得 */
export async function fetchDriveFolders(
  accessToken: string,
  parentId?: string,
): Promise<DriveFolder[]> {
  const q = parentId
    ? `mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;

  const allFolders: DriveFolder[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q,
      fields: 'nextPageToken,files(id,name)',
      pageSize: '1000',
      orderBy: 'name',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!resp.ok) throw new Error(`Drive API error: ${resp.status}`);
    const data = await resp.json() as { files?: DriveFolder[]; nextPageToken?: string };
    allFolders.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allFolders;
}

/** Firestore から Drive 認証情報を読み込み、必要に応じて Worker でリフレッシュ */
export async function loadAccessToken(
  uid: string,
  authData: VcAuth,
): Promise<string | null> {
  // 5分以上有効なら使用
  if (authData.tokenExpiry > Date.now() + 5 * 60 * 1000) {
    return authData.accessToken;
  }
  // リフレッシュ
  const proxyUrl = import.meta.env.VITE_DRIVE_PROXY_URL as string;
  try {
    const resp = await fetch(`${proxyUrl}/oauth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid }),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as { accessToken: string };
    return data.accessToken;
  } catch {
    return null;
  }
}
