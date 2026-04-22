import { useState, useEffect, useCallback, useMemo } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { db } from '../shared/firebase';
import { useAuth } from '../auth/AuthContext';
import { usePageTitle } from '../shared/usePageTitle';
import { useToast } from '../shared/useToast';
import { useFirestoreData } from '../shared/useFirestoreData';
import { useFirestoreSave } from '../shared/useFirestoreSave';
import { AppMenu } from '../shared/AppMenu';
import { AppFooter } from '../shared/AppFooter';
import { DbErrorBanner } from '../shared/DbErrorBanner';
import { Button } from '@/components/ui/button';
import '../shared/app.css';
import './videocollect.css';
import {
  type DriveFile,
  type DriveFolder,
  type VcData,
  type VcAuth,
  VC_INITIAL_DATA,
  firestorePaths,
  parseVcData,
  VC_ERROR_CODES,
  fetchAllDriveFiles,
  loadAccessToken,
} from './constants';
import { VideoGrid } from './views/VideoGrid';
import { FolderModal } from './modals/FolderModal';
import { FilterModal } from './modals/FilterModal';
import { TagModal } from './modals/TagModal';
import { UploadModal } from './modals/UploadModal';

type PageState =
  | { status: 'unauthenticated' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'empty' }
  | { status: 'loaded'; files: DriveFile[] };

type Modal =
  | null
  | { type: 'folder' }
  | { type: 'upload' }
  | { type: 'filter' }
  | { type: 'tag'; file: DriveFile };

export const Videocollect = () => {
  const { currentUser } = useAuth();
  usePageTitle('動画');
  const { toasts, addToast } = useToast();

  const [pageState, setPageState] = useState<PageState>({ status: 'loading' });
  const [modal, setModal] = useState<Modal>(null);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<'date-desc' | 'date-asc' | 'name-asc' | 'name-desc' | 'size-desc' | 'size-asc' | 'tag-asc' | 'tag-desc'>('date-desc');

  const { data, setData, loading, dbError } = useFirestoreData({
    currentUser,
    path: currentUser ? firestorePaths.vcData(currentUser.uid) : '',
    parse: parseVcData,
    loadingKey: 'vc-data',
    initialData: VC_INITIAL_DATA,
  });

  const saveData = useFirestoreSave<VcData>({
    currentUser,
    path: currentUser ? firestorePaths.vcData(currentUser.uid) : '',
  });

  useEffect(() => {
    if (!currentUser) return;
    getDoc(doc(db, firestorePaths.vcAuth(currentUser.uid)))
      .then(snap => {
        if (!snap.exists()) {
          setPageState({ status: 'unauthenticated' });
          return null;
        }
        const auth = snap.data() as VcAuth;
        if (!auth.refreshToken) {
          setPageState({ status: 'unauthenticated' });
          return null;
        }
        return loadAccessToken(currentUser.uid, auth);
      })
      .then(token => {
        if (token === null) return;
        if (!token) {
          addToast(`Drive に接続できませんでした [${VC_ERROR_CODES.TOKEN_REFRESH}]`, 'error');
          setPageState({ status: 'unauthenticated' });
          return;
        }
        setAccessToken(token);
      })
      .catch(e => {
        console.error('VcAuth 読み込みエラー:', e);
        setPageState({ status: 'error' });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const fetchFiles = useCallback(async (token: string, folders: DriveFolder[]) => {
    setPageState({ status: 'loading' });
    try {
      let q = "mimeType contains 'video/' and trashed=false";
      if (folders.length > 0) {
        const clauses = folders.map(f => `'${f.id}' in parents`).join(' or ');
        q = `(${clauses}) and mimeType contains 'video/' and trashed=false`;
      }
      const files = await fetchAllDriveFiles(token, q);
      setPageState(files.length > 0 ? { status: 'loaded', files } : { status: 'empty' });
    } catch (e) {
      console.error('ファイル取得エラー:', e);
      addToast(`動画一覧の取得に失敗しました [${VC_ERROR_CODES.FILES_FETCH}]`, 'error');
      setPageState({ status: 'error' });
    }
  }, [addToast]);

  // VcData のロード完了 + accessToken の両方が揃ったら一覧取得
  useEffect(() => {
    if (!accessToken || loading) return;
    fetchFiles(accessToken, data.folders);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, loading]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    Object.values(data.tags).forEach(tags => tags.forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [data.tags]);

  const filteredFiles = useMemo(() => {
    if (pageState.status !== 'loaded') return [];
    const files = activeTags.length > 0
      ? pageState.files.filter(f => activeTags.some(t => (data.tags[f.id] ?? []).includes(t)))
      : pageState.files;
    return [...files].sort((a, b) => {
      switch (sortKey) {
        case 'date-desc': return new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime();
        case 'date-asc':  return new Date(a.modifiedTime).getTime() - new Date(b.modifiedTime).getTime();
        case 'name-asc':  return a.name.localeCompare(b.name, 'ja');
        case 'name-desc': return b.name.localeCompare(a.name, 'ja');
        case 'size-desc': return Number(b.size ?? 0) - Number(a.size ?? 0);
        case 'size-asc':  return Number(a.size ?? 0) - Number(b.size ?? 0);
        case 'tag-asc': {
          const ta = (data.tags[a.id] ?? [])[0] ?? '￿';
          const tb = (data.tags[b.id] ?? [])[0] ?? '￿';
          return ta.localeCompare(tb, 'ja');
        }
        case 'tag-desc': {
          const ta = (data.tags[a.id] ?? [])[0] ?? '';
          const tb = (data.tags[b.id] ?? [])[0] ?? '';
          return tb.localeCompare(ta, 'ja');
        }
      }
    });
  }, [pageState, activeTags, data.tags, sortKey]);

  const handleFolderSave = (folders: DriveFolder[]) => {
    const next = { ...data, folders };
    setData(next);
    saveData(next);
    setModal(null);
    if (accessToken) fetchFiles(accessToken, folders);
  };

  const handleTagSave = (file: DriveFile, tags: string[]) => {
    const next = { ...data, tags: { ...data.tags, [file.id]: tags } };
    setData(next);
    saveData(next);
    setModal(null);
  };

  const handleUploaded = () => {
    if (accessToken) fetchFiles(accessToken, data.folders);
  };

  if (pageState.status === 'unauthenticated') {
    return (
      <div className="vc-page">
        <header className="app-header">
          <AppMenu />
          <h1>動画</h1>
          <div style={{ width: 36 }} />
        </header>
        <div className="vc-unauth">
          <p className="vc-unauth-title">Google Drive が連携されていません</p>
          <p className="vc-unauth-desc">設定画面から Google Drive に接続してください</p>
          <Link to="/app/settings" className="vc-unauth-link">設定へ</Link>
        </div>
        <AppFooter />
      </div>
    );
  }

  return (
    <div className="vc-page">
      {dbError && <DbErrorBanner />}

      <header className="app-header">
        <AppMenu />
        <h1>動画</h1>
        <div style={{ width: 36 }} />
      </header>

      <main style={{ padding: '16px', paddingBottom: 80 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
          <button
            className="vc-icon-btn"
            onClick={() => setModal({ type: 'folder' })}
            aria-label="フォルダ設定"
            title="フォルダ設定"
            style={{ border: '1px solid var(--vc-card-border)', borderRadius: 8, padding: '6px 10px', gap: 6 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" />
            </svg>
            <span style={{ fontSize: 13 }}>フォルダ</span>
          </button>
          <Button
            variant="default"
            size="sm"
            onClick={() => setModal({ type: 'upload' })}
            disabled={!accessToken}
          >
            アップロード
          </Button>
          <button
            className="vc-icon-btn"
            onClick={() => setModal({ type: 'filter' })}
            aria-label="タグで絞り込み"
            title="タグで絞り込み"
            style={{ border: '1px solid var(--vc-card-border)', borderRadius: 8, padding: '6px 10px', gap: 6, position: 'relative' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
            </svg>
            <span style={{ fontSize: 13 }}>フィルター</span>
            {activeTags.length > 0 && (
              <span style={{
                position: 'absolute', top: -6, right: -6,
                background: 'var(--vc-accent)', color: '#fff',
                fontSize: 10, fontWeight: 700, borderRadius: '99px',
                minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 4px',
              }}>
                {activeTags.length}
              </span>
            )}
          </button>

        </div>

        {pageState.status === 'loading' && (
          <div className="vc-empty">
            <p style={{ fontSize: 14, color: 'var(--vc-text-secondary)' }}>読み込み中…</p>
          </div>
        )}
        {pageState.status === 'error' && (
          <div className="vc-empty">
            <p style={{ fontSize: 14, color: 'var(--vc-text-secondary)' }}>
              エラーが発生しました
            </p>
          </div>
        )}
        {pageState.status === 'empty' && (
          <div className="vc-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"
              style={{ color: 'var(--vc-text-secondary)', opacity: 0.4 }}>
              <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z" />
            </svg>
            <p style={{ fontSize: 14, color: 'var(--vc-text-secondary)' }}>
              動画が見つかりませんでした
            </p>
          </div>
        )}
        {pageState.status === 'loaded' && filteredFiles.length === 0 && activeTags.length > 0 && (
          <div className="vc-empty">
            <p style={{ fontSize: 14, color: 'var(--vc-text-secondary)' }}>
              選択したタグの動画がありません
            </p>
          </div>
        )}
        {pageState.status === 'loaded' && filteredFiles.length > 0 && (
          <VideoGrid
            files={filteredFiles}
            tags={data.tags}
            accessToken={accessToken!}
            onTagEdit={file => setModal({ type: 'tag', file })}
          />
        )}
      </main>

      <AppFooter />

      {/* トースト */}
      <div className="vc-toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`vc-toast vc-toast--${t.type}`}>{t.msg}</div>
        ))}
      </div>

      {/* モーダル */}
      {modal?.type === 'filter' && (
        <FilterModal
          allTags={allTags}
          activeTags={activeTags}
          sortKey={sortKey}
          onApply={(tags, sort) => { setActiveTags(tags); setSortKey(sort); }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'folder' && accessToken && (
        <FolderModal
          selectedFolders={data.folders}
          accessToken={accessToken}
          onSave={handleFolderSave}
          onClose={() => setModal(null)}
          onError={msg => addToast(msg, 'error')}
        />
      )}
      {modal?.type === 'upload' && accessToken && (
        <UploadModal
          accessToken={accessToken}
          defaultFolders={data.folders}
          onUploaded={handleUploaded}
          onClose={() => setModal(null)}
          onError={msg => addToast(msg, 'error')}
        />
      )}
      {modal?.type === 'tag' && (
        <TagModal
          file={modal.file}
          currentTags={data.tags[modal.file.id] ?? []}
          onSave={tags => handleTagSave(modal.file, tags)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
};
