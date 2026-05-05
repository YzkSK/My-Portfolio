import { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useFirestoreData } from '../shared/useFirestoreData';
import { useFirestoreSave } from '../shared/useFirestoreSave';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SettingsSectionProps } from '../platform/registry';
import { type TranscribeSettingsData, DEFAULT_TRANSCRIBE_SETTINGS, parseTranscribeSettings } from './constants';

const SETTINGS_ERROR_CODES = {
  SAVE_FAILED: 'E201',
} as const;

export const TranscribeSettings = ({ addToast }: SettingsSectionProps) => {
  const { currentUser } = useAuth();
  const [defaultLanguage, setDefaultLanguage] = useState<'auto' | 'ja' | 'en' | 'zh'>('auto');
  const [autoDeleteDays, setAutoDeleteDays] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { data, loading } = useFirestoreData<TranscribeSettingsData>({
    currentUser: currentUser || null,
    path: currentUser?.uid ? `users/${currentUser.uid}/transcribe/settings` : 'temp',
    loadingKey: 'transcribe-settings',
    initialData: DEFAULT_TRANSCRIBE_SETTINGS,
    parse: parseTranscribeSettings,
  });

  const save = useFirestoreSave<TranscribeSettingsData>({
    currentUser: currentUser || null,
    path: currentUser?.uid ? `users/${currentUser.uid}/transcribe/settings` : 'temp',
  });

  useEffect(() => {
    if (data) {
      setDefaultLanguage(data.defaultLanguage);
      setAutoDeleteDays(data.autoDeleteDays ?? null);
    }
  }, [data]);

  const handleSave = async () => {
    if (!currentUser) return;
    setIsSaving(true);
    try {
      const updated: TranscribeSettingsData = { defaultLanguage, autoDeleteDays };
      save(updated);
      addToast('設定を保存しました', 'normal');
    } catch (err) {
      console.error('Failed to save transcribe settings:', err);
      addToast(`設定の保存に失敗しました [${SETTINGS_ERROR_CODES.SAVE_FAILED}]`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return <p className="transcribe-settings-loading">読み込み中...</p>;
  }

  return (
    <div className="transcribe-settings-card">
      <div className="transcribe-settings-head">
        <div>
          <div className="transcribe-settings-eyebrow">Transcribe</div>
          <h4 className="transcribe-settings-title">アプリ設定</h4>
        </div>
        <p className="transcribe-settings-lead">文字起こしの初期値と保存ポリシーを調整できます。</p>
      </div>

      <div className="transcribe-settings-row">
        <div className="transcribe-settings-row-copy">
          <Label className="transcribe-settings-label">デフォルト言語</Label>
          <p className="transcribe-settings-help">新規アップロード時に選択される初期値です。</p>
        </div>
        <select
          value={defaultLanguage}
          onChange={(e) => setDefaultLanguage(e.target.value as 'auto' | 'ja' | 'en' | 'zh')}
          className="transcribe-select transcribe-select--settings"
        >
          <option value="auto">自動検出</option>
          <option value="ja">日本語</option>
          <option value="en">英語</option>
          <option value="zh">中国語</option>
        </select>
      </div>

      <div className="transcribe-settings-row">
        <div className="transcribe-settings-row-copy">
          <Label className="transcribe-settings-label">古いファイルの自動削除</Label>
          <p className="transcribe-settings-help">未使用の文字起こしを整理するための目安です。空欄で無効化します。</p>
        </div>
        <div className="transcribe-settings-inline">
          <Input
            type="number"
            min="1"
            max="365"
            value={autoDeleteDays ?? ''}
            onChange={(e) => setAutoDeleteDays(e.target.value ? parseInt(e.target.value, 10) : null)}
            placeholder="無効"
            className="transcribe-settings-number"
          />
          <span className="transcribe-settings-inline-suffix">日以上前</span>
        </div>
      </div>

      <p className="transcribe-settings-note">
        ※ 自動削除は手動では実行されません。定期的なクリーンアップに使用されます。
      </p>

      <div className="transcribe-settings-actions">
        <Button variant="default" onClick={handleSave} disabled={isSaving} className="transcribe-settings-save-btn">
          {isSaving ? '保存中...' : '保存'}
        </Button>
      </div>
    </div>
  );
};
