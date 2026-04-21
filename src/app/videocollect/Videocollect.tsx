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
  | { type: 'tag'; file: DriveFile };

export const Videocollect = () => {
  const { currentUser } = useAuth();
  usePageTitle('動画');
  const { toasts, addToast } = useToast();

  const [pageState, setPageState] = useState<PageState>({ status: 'loading' });
  const [modal, setModal] = useState<Modal>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

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
    if (!activeTag) return pageState.files;
    return pageState.files.filter(f => (data.tags[f.id] ?? []).includes(activeTag));
  }, [pageState, activeTag, data.tags]);

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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="vc-icon-btn"
            onClick={() => setModal({ type: 'folder' })}
            aria-label="フォルダ設定"
            title="フォルダ設定"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" />
            </svg>
          </button>
          <Button
            variant="default"
            size="sm"
            onClick={() => setModal({ type: 'upload' })}
            disabled={!accessToken}
          >
            アップロード
          </Button>
        </div>
      </header>

      <main style={{ padding: '16px', paddingBottom: 80 }}>
        {allTags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {allTags.map(tag => (
              <button
                key={tag}
                className={`vc-tag vc-tag--filter${activeTag === tag ? ' vc-tag--active' : ''}`}
                onClick={() => setActiveTag(prev => prev === tag ? null : tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

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
        {pageState.status === 'loaded' && filteredFiles.length === 0 && activeTag && (
          <div className="vc-empty">
            <p style={{ fontSize: 14, color: 'var(--vc-text-secondary)' }}>
              「{activeTag}」のタグが付いた動画がありません
            </p>
          </div>
        )}
        {pageState.status === 'loaded' && filteredFiles.length > 0 && (
          <VideoGrid
            files={filteredFiles}
            tags={data.tags}
            onTagEdit={file => setModal({ type: 'tag', file })}
          />
        )}
      </main>

      <AppFooter />

      {/* トースト */}
      <div className="vc-toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`vc-toast${t.type === 'error' ? ' vc-toast--error' : t.type === 'warning' ? ' vc-toast--warning' : ''}`}>
            {t.msg}
          </div>
        ))}
      </div>

      {/* モーダル */}
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
