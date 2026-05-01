import React, { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { useFirestoreData } from '@/app/shared/useFirestoreData';
import { useToast } from '@/app/shared/useToast';
import { useSetLoading } from '@/app/shared/AppLoadingContext';
import { validateVideoFile, uploadVideoToGeminiFiles, generateTranscription } from './transcriptionService';
import { parseTranscription, type Transcription } from './constants';
import { doc } from 'firebase/firestore';
import { db } from '@/app/shared/firebase';
import { useAuth } from '@/app/auth/AuthContext';
import { AppLayout } from '../platform/AppLayout';
import { Button } from '@/components/ui/button';
import './transcribe.css';

const LANGUAGE_LABELS: Record<string, string> = {
  auto: '自動検出',
  ja: '日本語',
  en: '英語',
  zh: '中国語',
};

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
  const selectedLanguageLabel = LANGUAGE_LABELS[language] ?? language;

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
      navigate(`/app/transcribe/play?id=${transcriptionId}`);
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
    <AppLayout
      title="文字起こし"
      className="px-[14px] pt-5 pb-[120px]"
      dbError={dbError}
      headerActions={(
        <Button asChild variant="outline" size="sm">
          <Link to="/app/settings#settings-transcribe">設定</Link>
        </Button>
      )}
    >
      <div className="transcribe-shell">
        <section className="transcribe-hero" role="region" aria-labelledby="transcribe-hero-title">
          <div className="transcribe-hero-copy">
            <div className="transcribe-eyebrow">Gemini 文字起こし</div>
            <h2 id="transcribe-hero-title" className="transcribe-hero-title">動画をそのまま、読みやすい文字起こしに。</h2>
            <p className="transcribe-hero-text">
              ファイルをアップロードすると、要約・キーワード付きで保存できます。履歴から編集や再出力も可能です。
            </p>
          </div>

          <div className="transcribe-hero-stats">
            <div className="transcribe-stat" aria-label={`保存件数 ${transcriptions.length} 件`}>
              <span className="transcribe-stat-label">保存件数</span>
              <strong>{transcriptions.length}</strong>
            </div>
            <div className="transcribe-stat" aria-label={`選択言語 ${selectedLanguageLabel}`}>
              <span className="transcribe-stat-label">選択言語</span>
              <strong>{selectedLanguageLabel}</strong>
            </div>
            <div className="transcribe-stat" aria-live="polite" aria-atomic="true">
              <span className="transcribe-stat-label">状態</span>
              <strong>{processing ? '処理中' : '待機中'}</strong>
            </div>
          </div>
        </section>

        <div className="transcribe-grid">
          <section className="transcribe-card" role="region" aria-labelledby="transcribe-upload-title">
            <div className="transcribe-card-header">
              <div>
                <h3 id="transcribe-upload-title" className="transcribe-card-title">新しい動画をアップロード</h3>
                <p className="transcribe-card-desc">動画ファイルを選ぶか、ここにドラッグして開始します。</p>
              </div>
            </div>

            <label className={`transcribe-dropzone${file ? ' transcribe-dropzone--filled' : ''}${processing ? ' transcribe-dropzone--disabled' : ''}`}>
              <input
                type="file"
                accept="video/*"
                onChange={onFileChange}
                disabled={processing}
                className="transcribe-file-input"
                aria-label="動画ファイルを選択"
              />
              <div className="transcribe-dropzone-icon">⤴</div>
              <div className="transcribe-dropzone-copy">
                <strong>ファイルを選択</strong>
                <span>またはドラッグ&ドロップ</span>
              </div>
              {file && (
                <div className="transcribe-file-card">
                  <span className="transcribe-file-name">{file.name}</span>
                  <span className="transcribe-file-meta">{(file.size / (1024 * 1024)).toFixed(1)} MB</span>
                </div>
              )}
            </label>

            <div className="transcribe-form-grid">
              <label className="transcribe-field">
                <span className="transcribe-field-label">言語</span>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  disabled={processing}
                  className="transcribe-select"
                  aria-label="文字起こしの言語を選択"
                >
                  <option value="auto">自動検出</option>
                  <option value="ja">日本語</option>
                  <option value="en">英語</option>
                  <option value="zh">中国語</option>
                </select>
              </label>

              <div className="transcribe-note">
                <span className="transcribe-note-label">対応形式</span>
                <span className="transcribe-note-value">MP4 / MOV / WebM / AVI</span>
              </div>
            </div>

            <div className="transcribe-actions">
              <Button onClick={onStartTranscription} disabled={!file || processing} className="transcribe-start-btn">
                {processing ? '処理中...' : '文字起こしを開始'}
              </Button>
            </div>
          </section>

          <section className="transcribe-card" role="region" aria-labelledby="transcribe-history-title">
            <div className="transcribe-card-header transcribe-card-header--spread">
              <div>
                <h3 id="transcribe-history-title" className="transcribe-card-title">履歴</h3>
                <p className="transcribe-card-desc">過去に処理した文字起こしを開いて編集できます。</p>
              </div>
              <div className="transcribe-badge">{transcriptions.length} 件</div>
            </div>

            {transcriptions.length === 0 ? (
              <div className="transcribe-empty-state">
                <div className="transcribe-empty-icon">📝</div>
                <p>まだ処理済みのファイルはありません。</p>
              </div>
            ) : (
              <div className="transcribe-history-list" role="list" aria-label="文字起こし履歴">
                {transcriptions.map((t) => (
                  <button
                    type="button"
                    key={t.transcriptionId}
                    className="transcribe-history-item"
                    onClick={() => navigate(`/app/transcribe/play?id=${t.transcriptionId}`)}
                    aria-label={`履歴を開く ${t.fileName}`}
                  >
                    <div className="transcribe-history-main" role="listitem">
                      <div className="transcribe-history-top">
                        <span className="transcribe-history-name">{t.fileName}</span>
                        <span className="transcribe-history-language">{LANGUAGE_LABELS[t.language ?? 'auto'] ?? '自動'}</span>
                      </div>
                      {t.summary && <p className="transcribe-history-summary">{t.summary}</p>}
                    </div>
                    <div className="transcribe-history-meta">
                      <span>{new Date(t.createdAt ?? 0).toLocaleDateString('ja-JP')}</span>
                      <span>信頼度 {(t.confidence ?? 0).toFixed(2)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </AppLayout>
  );
};

export default Transcribe;
