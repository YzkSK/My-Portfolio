import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { useFirestoreData } from '@/app/shared/useFirestoreData';
import { useToast } from '@/app/shared/useToast';
import { useSetLoading } from '@/app/shared/AppLoadingContext';
import { validateVideoFile, uploadVideoToGeminiFiles, generateTranscription } from './transcriptionService';
import { parseTranscription, type Transcription } from './constants';
import { doc } from 'firebase/firestore';
import { db } from '@/app/shared/firebase';
import { useAuth } from '@/app/auth/AuthContext';
import './transcribe.css';

export const Transcribe: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { addToast } = useToast();
  const setLoading = useSetLoading();

  // Firestore から過去の文字起こし一覧を読み込み
  const { data: transcriptions = [], dbError } = useFirestoreData<Transcription[]>({
    path: currentUser?.uid ? `users/${currentUser.uid}/transcribe/transcriptions` : 'temp',
    currentUser: currentUser || null,
    loadingKey: 'transcribe-list',
    initialData: [],
    parse: (raw: any) => {
      if (!Array.isArray(raw)) return [];
      return raw.map(parseTranscription);
    },
  });

  // ローカル状態
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState<string>('auto');
  const [processing, setProcessing] = useState(false);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      setFile(null);
      return;
    }
    const v = validateVideoFile(f);
    if (!v.valid) {
      addToast(`ファイル検証エラー: ${v.error}`, 'error');
      setFile(null);
      return;
    }
    setFile(f);
    addToast(`ファイル: ${f.name} を選択しました`, 'normal');
  };

  const onStartTranscription = useCallback(async () => {
    if (!file || !currentUser) return;

    setProcessing(true);
    setLoading('transcribe', true);

    try {
      addToast('ファイルをアップロード中...', 'normal');
      const fileId = await uploadVideoToGeminiFiles(file);

      addToast('文字起こし処理中（Gemini で処理しています）...', 'normal');
      const result = await generateTranscription(fileId, language === 'auto' ? undefined : language);

      // Firestore に保存
      const transcriptionId = nanoid();
      const transcription: Transcription = {
        transcriptionId,
        fileId,
        fileName: file.name,
        language: language === 'auto' ? result.language : language,
        text: result.text ?? '',
        paragraphs: result.paragraphs ?? [],
        keywords: result.keywords ?? [],
        summary: result.summary ?? '',
        confidence: result.confidence ?? 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        processedAt: Date.now(),
      };

      const path = `users/${currentUser.uid}/transcribe/transcriptions/${transcriptionId}`;
      const docRef = doc(db, path);
      const { setDoc } = await import('firebase/firestore');
      await setDoc(docRef, transcription);

      addToast('文字起こしが完了しました', 'normal');
      setFile(null);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('Transcription error:', err);
      const msg = err?.message ?? '不明なエラーが発生しました';
      addToast(`エラー: ${msg}`, 'error');
    } finally {
      setProcessing(false);
      setLoading('transcribe', false);
    }
  }, [file, currentUser, language, addToast, setLoading]);

  return (
    <div className="transcribe-root">
      <h2>文字起こし（Transcribe）</h2>

      {dbError && (
        <div className="db-error" style={{ color: 'var(--app-error, red)', marginBottom: 12 }}>
          Firestore データ読み込みエラー。ページをリロードしてください。
        </div>
      )}

      <div className="upload-section">
        <h3>動画をアップロード</h3>
        <div className="upload-area">
          <label className="file-label">
            <input
              type="file"
              accept="video/*"
              onChange={onFileChange}
              disabled={processing}
              style={{ display: 'none' }}
            />
            <span style={{ cursor: 'pointer', textDecoration: 'underline' }}>
              ファイルを選択または、ドラッグ&ドロップ
            </span>
          </label>
          {file && <div style={{ marginTop: 8 }}>選択: {file.name}</div>}

          <div style={{ marginTop: 12 }}>
            <label>
              言語:
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={processing}
                style={{ marginLeft: 8 }}
              >
                <option value="auto">自動検出</option>
                <option value="ja">日本語</option>
                <option value="en">英語</option>
                <option value="zh">中国語</option>
              </select>
            </label>
          </div>

          <button onClick={onStartTranscription} disabled={!file || processing} style={{ marginTop: 12 }}>
            {processing ? '処理中...' : '処理開始'}
          </button>
        </div>
      </div>

      <div className="history-section">
        <h3>過去の文字起こし</h3>
        {transcriptions.length === 0 ? (
          <p>まだ処理済みのファイルはありません。</p>
        ) : (
          <ul className="transcription-list">
            {transcriptions.map((t) => (
              <li
                key={t.transcriptionId}
                style={{ cursor: 'pointer', padding: 8, margin: 4, border: '1px solid var(--app-border)' }}
                onClick={() => navigate(`/app/transcribe/play?id=${t.transcriptionId}`)}
              >
                <div style={{ fontWeight: 'bold' }}>{t.fileName}</div>
                <div style={{ fontSize: '0.9em', color: 'var(--app-text-muted, #666)' }}>
                  {new Date(t.createdAt ?? 0).toLocaleString('ja-JP')}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Transcribe;
