import React, { useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useFirestoreData } from '@/app/shared/useFirestoreData';
import { useToast } from '@/app/shared/useToast';
import { usePageTitle } from '@/app/shared/usePageTitle';
import { useAuth } from '@/app/auth/AuthContext';
import { parseTranscription, type Transcription } from './constants';
import { buildTranscriptionExportData } from './exportUtils';
import { doc, deleteDoc } from 'firebase/firestore';
import { db } from '@/app/shared/firebase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import './transcribe.css';

export const TranscribePlay: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { addToast } = useToast();

  const transcriptionId = searchParams.get('id');
  usePageTitle(transcriptionId ? `文字起こし: ${transcriptionId}` : 'Text View');

  // Firestore から詳細を読み込み
  const path = currentUser?.uid && transcriptionId ? `users/${currentUser.uid}/transcribe/transcriptions/${transcriptionId}` : 'temp';
  const { data: transcription, loading } = useFirestoreData<Transcription>({
    path,
    currentUser: currentUser || null,
    loadingKey: 'transcribe-detail',
    initialData: { transcriptionId: '', fileName: '', text: '' },
    parse: parseTranscription,
  });

  const [editText, setEditText] = useState(transcription?.text ?? '');
  const [isDirty, setIsDirty] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditText(e.target.value);
    setIsDirty(true);
  };

  const onSave = useCallback(async () => {
    if (!currentUser || !transcriptionId) return;
    try {
      const path = `users/${currentUser.uid}/transcribe/transcriptions/${transcriptionId}`;
      const docRef = doc(db, path);
      const { setDoc } = await import('firebase/firestore');
      await setDoc(docRef, { ...transcription, text: editText, updatedAt: Date.now() }, { merge: true });
      addToast('保存しました', 'normal');
      setIsDirty(false);
    } catch (err: any) {
      addToast(`保存エラー: ${err?.message}`, 'error');
    }
  }, [transcription, editText, currentUser, transcriptionId, addToast]);

  const onDelete = useCallback(async () => {
    if (!currentUser || !transcriptionId) return;
    setIsDeleting(true);
    try {
      const path = `users/${currentUser.uid}/transcribe/transcriptions/${transcriptionId}`;
      await deleteDoc(doc(db, path));
      addToast('削除しました', 'normal');
      navigate('/app/transcribe');
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('Delete error:', err);
      addToast(`削除エラー: ${err?.message}`, 'error');
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  }, [currentUser, transcriptionId, navigate, addToast]);

  const onExportTXT = () => {
    const blob = new Blob([editText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${transcription?.fileName ?? 'transcription'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onExportJSON = () => {
    const exportData = buildTranscriptionExportData(transcription, editText);
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${transcription?.fileName ?? 'transcription'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div style={{ padding: 16 }}>読み込み中...</div>;
  if (!transcription) return <div style={{ padding: 16 }}>データが見つかりません</div>;

  return (
    <div className="transcribe-play-root" style={{ padding: 16 }}>
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => navigate('/app/transcribe')} style={{ marginRight: 8 }}>
          ← 戻る
        </button>
        <button onClick={onSave} disabled={!isDirty}>
          保存
        </button>
        <button onClick={() => setShowExportDialog(true)} style={{ marginLeft: 8 }}>
          エクスポート
        </button>
        <button onClick={() => setShowDeleteDialog(true)} style={{ marginLeft: 8, color: 'var(--app-error, red)' }}>
          削除
        </button>
      </div>

      {/* エクスポート選択ダイアログ */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent style={{ maxWidth: 420 }} aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>エクスポート形式を選択</DialogTitle>
          </DialogHeader>
          <p style={{
            fontSize: 13,
            color: 'var(--app-text-secondary)',
            marginBottom: 16,
          }}>
            保存形式を選んでダウンロードできます。
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            <Button variant="outline" onClick={() => { onExportTXT(); setShowExportDialog(false); }}>
              TXT でエクスポート
            </Button>
            <Button variant="outline" onClick={() => { onExportJSON(); setShowExportDialog(false); }}>
              JSON でエクスポート
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent style={{ maxWidth: 400 }} aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>文字起こしを削除</DialogTitle>
          </DialogHeader>
          <p style={{
            fontSize: 13,
            color: 'var(--app-text-secondary)',
            marginBottom: 16,
          }}>
            この操作は取り消せません。
          </p>
          <div style={{
            fontSize: 13,
            color: 'var(--app-text)',
            marginBottom: 20,
            padding: '12px',
            backgroundColor: 'var(--app-bg-secondary)',
            borderRadius: 6,
          }}>
            <strong>{transcription?.fileName}</strong> を削除しますか？
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={isDeleting}
            >
              キャンセル
            </Button>
            <Button
              variant="default"
              onClick={onDelete}
              disabled={isDeleting}
              style={{
                backgroundColor: 'var(--app-error, #dc2626)',
                color: 'white',
              }}
            >
              {isDeleting ? '削除中...' : '削除'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div style={{ marginBottom: 12 }}>
        <h2>{transcription.fileName}</h2>
        <div style={{ fontSize: '0.9em', color: 'var(--app-text-muted, #666)' }}>
          言語: {transcription.language} | 信頼度: {(transcription.confidence ?? 0).toFixed(2)}
        </div>
      </div>

      {transcription.summary && (
        <div style={{ marginBottom: 12, padding: 8, background: 'var(--app-bg-muted, #f5f5f5)', borderRadius: 4 }}>
          <strong>要約:</strong> {transcription.summary}
        </div>
      )}

      {transcription.keywords && transcription.keywords.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <strong>キーワード:</strong>{' '}
          {transcription.keywords.map((kw) => (
            <span key={kw} style={{ display: 'inline-block', background: 'var(--app-bg-secondary, #eee)', padding: '2px 6px', margin: '0 4px', borderRadius: 3, fontSize: '0.9em' }}>
              {kw}
            </span>
          ))}
        </div>
      )}

      <div>
        <label>
          テキスト:
          <textarea
            value={editText}
            onChange={handleTextChange}
            style={{
              width: '100%',
              minHeight: '300px',
              padding: 8,
              fontFamily: 'monospace',
              fontSize: '0.95em',
              border: '1px solid var(--app-border)',
              borderRadius: 4,
              marginTop: 8,
            }}
          />
        </label>
      </div>

      {isDirty && <div style={{ marginTop: 8, color: 'var(--app-warning, orange)' }}>※ 変更があります。保存してください。</div>}
    </div>
  );
};

export default TranscribePlay;
