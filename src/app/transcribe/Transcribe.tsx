import React, { useState, useCallback, useRef } from 'react';
import { setDoc, doc } from 'firebase/firestore';
import { useFirestoreData } from '@/app/shared/useFirestoreData';
import { useToast } from '@/app/shared/useToast';
import { useSetLoading } from '@/app/shared/AppLoadingContext';
import { usePageTitle } from '@/app/shared/usePageTitle';
import { validateVideoFile, uploadVideoToGeminiFiles, generateTranscription } from './transcriptionService';
import { parseTranscription, firestorePaths, TRANSCRIBE_ERROR_CODES, type Transcription } from './constants';
import { errorMsg } from '../platform/errors';
import { db } from '@/app/shared/firebase';
import { useAuth } from '@/app/auth/AuthContext';
import { AppLayout } from '../platform/AppLayout';
import { Button } from '@/components/ui/button';
import '../shared/app.css';
import './transcribe.css';

const LANGUAGE_LABELS: Record<string, string> = {
  auto: '自動検出',
  ja: '日本語',
  en: '英語',
  zh: '中国語',
};

export const Transcribe: React.FC = () => {
  const { currentUser } = useAuth();
  const { toasts, addToast } = useToast();
  const setLoading = useSetLoading();
  usePageTitle('文字起こし');

  const path = currentUser?.uid ? firestorePaths.transcribeData(currentUser.uid) : '';

  const { data: transcriptions, setData: setTranscriptions, loading, dbError } = useFirestoreData<Transcription[]>({
    path,
    currentUser: currentUser ?? null,
    loadingKey: 'transcribe-list',
    initialData: [],
    parse: (raw) => Array.isArray(raw.transcriptions) ? raw.transcriptions.map(parseTranscription) : [],
  });

  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState<string>('auto');
  const [processing, setProcessing] = useState(false);
  const selectedLanguageLabel = LANGUAGE_LABELS[language] ?? language;
  const inputRef = useRef<HTMLInputElement | null>(null);

  const FILE_ERROR_MESSAGES: Record<string, string> = {
    [TRANSCRIBE_ERROR_CODES.INVALID_FILE_TYPE]: errorMsg('非対応のファイル形式です', TRANSCRIBE_ERROR_CODES.INVALID_FILE_TYPE),
    [TRANSCRIBE_ERROR_CODES.TOO_LARGE]: errorMsg('ファイルサイズが上限（100MB）を超えています', TRANSCRIBE_ERROR_CODES.TOO_LARGE),
  };

  const handleFile = (f: File | null) => {
    if (!f) return;
    const v = validateVideoFile(f);
    if (!v.valid) {
      const msg = v.error ? (FILE_ERROR_MESSAGES[v.error] ?? errorMsg('ファイルが無効です', v.error)) : 'ファイルが無効です';
      addToast(msg, 'error');
      return;
    }
    setFile(f);
    addToast(`${f.name} を選択しました`, 'normal');
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFile(e.target.files?.[0] ?? null);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleFile(e.dataTransfer?.files?.[0] ?? null);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onLabelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  const onStartTranscription = useCallback(async () => {
    if (!file || !currentUser) return;

    setProcessing(true);
    setLoading('transcribe', true);

    try {
      addToast('ファイルをアップロード中...', 'normal');
      const fileRef = await uploadVideoToGeminiFiles(file);

      addToast('文字起こし処理中（Gemini で処理しています）...', 'normal');
      const result = await generateTranscription(fileRef, language === 'auto' ? undefined : language);

      const transcription: Transcription = {
        transcriptionId: crypto.randomUUID(),
        fileName: file.name,
        language: language === 'auto' ? (result.language ?? 'auto') : language,
        text: result.text ?? '',
        paragraphs: result.paragraphs ?? [],
        keywords: result.keywords ?? [],
        summary: result.summary ?? '',
        confidence: result.confidence ?? 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        processedAt: Date.now(),
      };

      const updated = [transcription, ...transcriptions];
      await setDoc(doc(db, path), { transcriptions: updated });
      setTranscriptions(updated);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      addToast('文字起こしが完了しました', 'normal');
    } catch (err: unknown) {
      console.error('[Transcribe] error:', err);
      const code = err instanceof Error ? err.message : '';
      const TRANSCRIPTION_ERROR_MESSAGES: Record<string, string> = {
        [TRANSCRIBE_ERROR_CODES.NO_API_KEY]: errorMsg('API キーが設定されていません', TRANSCRIBE_ERROR_CODES.NO_API_KEY),
        [TRANSCRIBE_ERROR_CODES.API_ERROR]: errorMsg('Gemini API でエラーが発生しました', TRANSCRIBE_ERROR_CODES.API_ERROR),
        [TRANSCRIBE_ERROR_CODES.BAD_RESPONSE]: errorMsg('API からの応答が不正です', TRANSCRIBE_ERROR_CODES.BAD_RESPONSE),
      };
      addToast(TRANSCRIPTION_ERROR_MESSAGES[code] ?? errorMsg('文字起こしに失敗しました', 'E100'), 'error');
    } finally {
      setProcessing(false);
      setLoading('transcribe', false);
    }
  }, [file, currentUser, language, transcriptions, path, addToast, setLoading, setTranscriptions]);

  if (loading) return null;

  return (
    <AppLayout
      title="文字起こし"
      dbError={dbError}
      toasts={toasts}
    >
      <div className="tr-shell">
        <section className="tr-hero">
          <div className="tr-hero-stats">
            <div className="tr-stat">
              <span className="tr-stat-label">保存件数</span>
              <strong>{transcriptions.length}</strong>
            </div>
            <div className="tr-stat">
              <span className="tr-stat-label">選択言語</span>
              <strong>{selectedLanguageLabel}</strong>
            </div>
            <div className="tr-stat" aria-live="polite" aria-atomic="true">
              <span className="tr-stat-label">状態</span>
              <strong>{processing ? '処理中' : '待機中'}</strong>
            </div>
          </div>
        </section>

        <div className="tr-grid">
          {/* アップロード */}
          <section className="tr-card">
            <div className="tr-card-header">
              <h3 className="tr-card-title">新しい動画をアップロード</h3>
              <p className="tr-card-desc">動画ファイルを選ぶか、ここにドラッグして開始します。</p>
            </div>

            <div
              className={`tr-dropzone${file ? ' tr-dropzone--filled' : ''}${processing ? ' tr-dropzone--disabled' : ''}`}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onClick={() => !processing && inputRef.current?.click()}
              onKeyDown={onLabelKeyDown}
              tabIndex={0}
              role="button"
              aria-label="ファイルを選択またはドラッグしてください"
            >
              <input
                ref={inputRef}
                type="file"
                accept="video/*"
                onChange={onFileChange}
                disabled={processing}
                className="tr-file-input"
                aria-label="動画ファイルを選択"
              />
              <div className="tr-dropzone-icon">{file ? '✓' : '⤴'}</div>
              {file ? (
                <div className="tr-file-info">
                  <span className="tr-file-name">{file.name}</span>
                  <span className="tr-file-meta">{(file.size / (1024 * 1024)).toFixed(1)} MB</span>
                </div>
              ) : (
                <div className="tr-dropzone-copy">
                  <strong>ファイルを選択</strong>
                  <span>またはドラッグ&amp;ドロップ</span>
                </div>
              )}
            </div>

            <div className="tr-form-row">
              <label className="tr-field">
                <span className="tr-field-label">言語</span>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  disabled={processing}
                  className="tr-select"
                  aria-label="文字起こしの言語を選択"
                >
                  <option value="auto">自動検出</option>
                  <option value="ja">日本語</option>
                  <option value="en">英語</option>
                  <option value="zh">中国語</option>
                </select>
              </label>

              <div className="tr-note">
                <span className="tr-note-label">対応形式</span>
                <span className="tr-note-value">MP4 / MOV / WebM / AVI</span>
              </div>
            </div>

            <div className="tr-actions">
              <Button
                onClick={onStartTranscription}
                disabled={!file || processing}
              >
                {processing ? '処理中...' : '文字起こしを開始'}
              </Button>
            </div>
          </section>

          {/* 履歴 */}
          <section className="tr-card">
            <div className="tr-card-header tr-card-header--spread">
              <div>
                <h3 className="tr-card-title">履歴</h3>
                <p className="tr-card-desc">過去に処理した文字起こしを確認できます。</p>
              </div>
              <span className="tr-badge">{transcriptions.length} 件</span>
            </div>

            {transcriptions.length === 0 ? (
              <div className="tr-empty">
                <div className="tr-empty-icon">📝</div>
                <p>まだ処理済みのファイルはありません。</p>
              </div>
            ) : (
              <div className="tr-history-list" role="list" aria-label="文字起こし履歴">
                {transcriptions.map((t) => (
                  <div key={t.transcriptionId} className="tr-history-item" role="listitem">
                    <div className="tr-history-top">
                      <span className="tr-history-name">{t.fileName}</span>
                      <span className="tr-history-lang">{LANGUAGE_LABELS[t.language ?? 'auto'] ?? '自動'}</span>
                    </div>
                    {t.summary && <p className="tr-history-summary">{t.summary}</p>}
                    {t.text && (
                      <details className="tr-history-text-wrap">
                        <summary className="tr-history-text-toggle">全文を表示</summary>
                        <p className="tr-history-text">{t.text}</p>
                      </details>
                    )}
                    <div className="tr-history-meta">
                      <span>{new Date(t.createdAt ?? 0).toLocaleDateString('ja-JP')}</span>
                      {(t.confidence ?? 0) > 0 && <span>信頼度 {(t.confidence ?? 0).toFixed(2)}</span>}
                    </div>
                  </div>
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
