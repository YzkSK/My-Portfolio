import { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useFirestoreData } from '../shared/useFirestoreData';
import { useFirestoreSave } from '../shared/useFirestoreSave';
import { Button } from '@/components/ui/button';
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
    return <p style={{ fontSize: 13, color: 'var(--app-text-secondary)' }}>読み込み中...</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* デフォルト言語 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ fontSize: 14, fontWeight: 500 }}>デフォルト言語</label>
        <select
          value={defaultLanguage}
          onChange={(e) => setDefaultLanguage(e.target.value as 'auto' | 'ja' | 'en' | 'zh')}
          style={{
            padding: '6px 10px',
            borderRadius: 4,
            border: '1px solid var(--app-border)',
            backgroundColor: 'var(--app-bg)',
            color: 'var(--app-text)',
            fontSize: 13,
          }}
        >
          <option value="auto">自動検出</option>
          <option value="ja">日本語</option>
          <option value="en">英語</option>
          <option value="zh">中国語</option>
        </select>
      </div>

      {/* 自動削除設定 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ fontSize: 14, fontWeight: 500 }}>古いファイルの自動削除</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="number"
            min="1"
            max="365"
            value={autoDeleteDays ?? ''}
            onChange={(e) => setAutoDeleteDays(e.target.value ? parseInt(e.target.value, 10) : null)}
            placeholder="無効"
            style={{
              width: 60,
              padding: '6px 10px',
              borderRadius: 4,
              border: '1px solid var(--app-border)',
              backgroundColor: 'var(--app-bg)',
              color: 'var(--app-text)',
              fontSize: 13,
            }}
          />
          <span style={{ fontSize: 13, color: 'var(--app-text-secondary)' }}>日以上前</span>
        </div>
      </div>

      <p style={{ fontSize: 12, color: 'var(--app-text-secondary)', marginTop: 4 }}>
        ※ 自動削除は手動では実行されません。定期的なクリーンアップに使用されます。
      </p>

      {/* 保存ボタン */}
      <div style={{ marginTop: 12 }}>
        <Button
          variant="default"
          onClick={handleSave}
          disabled={isSaving}
          style={{ width: '100%' }}
        >
          {isSaving ? '保存中...' : '保存'}
        </Button>
      </div>
    </div>
  );
};
