import { useState, useEffect, useRef } from 'react';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../../shared/firebase';
import { getCachedImageUrl } from '../imageCache';
import {
  type AddModal, type EditModal, type Problem, type AnswerFormat,
  WRONG_CHOICES_COUNT, CHOICE2_OPTIONS,
} from '../constants';

type Props = {
  modal: AddModal | EditModal;
  problems: Problem[];
  answerFormat: AnswerFormat;
  uid: string;
  formError: string;
  onSave: (question: string, answer: string, category: string, wrongChoices: string[], memo: string, imageUrl: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

export const ProblemModal = ({ modal, problems, answerFormat, uid, formError, onSave, onDelete, onClose }: Props) => {
  const [question, setQuestion]         = useState('');
  const [answer, setAnswer]             = useState('');
  const [category, setCategory]         = useState('');
  const [memo, setMemo]                 = useState('');
  const [wrongChoices, setWrongChoices] = useState<string[]>([]);
  const [existingImageUrl, setExistingImageUrl] = useState('');
  const [imageFile, setImageFile]       = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [imageRemoved, setImageRemoved] = useState(false);
  const [imageError, setImageError]     = useState('');
  const [uploading, setUploading]       = useState(false);
  const [imgLoaded, setImgLoaded]       = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const needed = WRONG_CHOICES_COUNT[answerFormat];
    if (modal.type === 'edit') {
      const p = problems.find(p => p.id === modal.problemId);
      if (p) {
        setQuestion(p.question);
        setAnswer(p.answer);
        setCategory(p.category);
        setMemo(p.memo);
        const wc = [...p.wrongChoices];
        while (wc.length < needed) wc.push('');
        setWrongChoices(wc.slice(0, needed));
        if (p.imageUrl) {
          getCachedImageUrl(p.imageUrl).then(url => {
            setExistingImageUrl(p.imageUrl ?? '');
            setImagePreview(url);
          }).catch(() => {
            setExistingImageUrl(p.imageUrl ?? '');
            setImagePreview(p.imageUrl ?? '');
          });
        }
      }
    } else {
      setWrongChoices(Array(needed).fill(''));
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setImageError('画像は1MB以下にしてください');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setImageError('');
    setImageFile(file);
    setImageRemoved(false);
    setImgLoaded(true); // ローカルファイルはすぐ表示
    setImagePreview(URL.createObjectURL(file));
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview('');
    setImageRemoved(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async () => {
    let imageUrl = existingImageUrl;

    if (imageFile) {
      setUploading(true);
      try {
        const ext = imageFile.name.split('.').pop() ?? 'jpg';
        const path = `quiz-images/${uid}/${crypto.randomUUID()}.${ext}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, imageFile);
        imageUrl = await getDownloadURL(storageRef);
        // 古い画像を削除
        if (existingImageUrl) {
          try { await deleteObject(ref(storage, existingImageUrl)); } catch {}
        }
      } catch (e) {
        console.error('画像アップロードエラー:', e);
        setUploading(false);
        return;
      }
      setUploading(false);
    } else if (imageRemoved) {
      if (existingImageUrl) {
        try { await deleteObject(ref(storage, existingImageUrl)); } catch {}
      }
      imageUrl = '';
    }

    onSave(question, answer, category, wrongChoices.map(s => s.trim()), memo, imageUrl);
  };

  const handleWrongChoiceChange = (index: number, value: string) => {
    setWrongChoices(prev => prev.map((v, i) => i === index ? value : v));
  };

  const wrongChoiceCount = WRONG_CHOICES_COUNT[answerFormat];
  const currentPreview = imagePreview;

  return (
    <div className="qz-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="qz-modal">
        <div className="qz-modal-title">
          {modal.type === 'add' ? '問題を追加' : '問題を編集'}
        </div>

        {formError && <div className="qz-modal-error">{formError}</div>}

        {/* 問題文 */}
        <div className="qz-modal-field">
          <div className="qz-modal-label">問題文 *</div>
          <textarea
            className={`qz-modal-textarea${formError && !question.trim() ? ' qz-modal-textarea--error' : ''}`}
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="問題文を入力してください"
            autoFocus
          />
        </div>

        {/* 画像 */}
        <div className="qz-modal-field">
          <div className="qz-modal-label">画像（任意）</div>
          {currentPreview ? (
            <div className="qz-img-preview-wrap">
              {!imgLoaded && <div className="qz-img-spinner qz-img-spinner--preview" />}
              {imgLoaded && (
                <div className="qz-img-preview-inner">
                  <img src={currentPreview} className="qz-img-preview" alt="問題画像" />
                  <button className="qz-img-remove-btn" onClick={handleRemoveImage} type="button">✕ 削除</button>
                </div>
              )}
              {/* ロード検知用（非表示） */}
              {!imgLoaded && (
                <img src={currentPreview} style={{ display: 'none' }} alt=""
                  onLoad={() => setImgLoaded(true)} onError={() => setImgLoaded(true)} />
              )}
            </div>
          ) : (
            <button
              className="qz-img-upload-btn"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              ＋ 画像を選択
            </button>
          )}
          {currentPreview && (
            <button
              className="qz-btn"
              style={{ fontSize: 12, marginTop: 6 }}
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              画像を変更
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          {imageError && <div className="qz-modal-error" style={{ marginTop: 6 }}>{imageError}</div>}
        </div>

        {/* 正解 */}
        <div className="qz-modal-field">
          <div className="qz-modal-label">{wrongChoiceCount > 0 ? '正解 *' : '答え *'}</div>
          {answerFormat === 'choice2' ? (
            <div className="qz-mode-btns">
              {CHOICE2_OPTIONS.map(opt => (
                <button
                  key={opt}
                  type="button"
                  className={`qz-mode-btn${answer === opt ? ' qz-mode-btn--active' : ''}${formError && !answer ? ' qz-mode-btn--error' : ''}`}
                  style={{ flex: 1, fontSize: 18 }}
                  onClick={() => setAnswer(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <input
              className={`qz-modal-input${formError && !answer.trim() ? ' qz-modal-input--error' : ''}`}
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              placeholder={wrongChoiceCount > 0 ? '正解の選択肢を入力' : '答えを入力してください'}
            />
          )}
        </div>

        {/* 不正解の選択肢（choice4） */}
        {wrongChoiceCount > 0 && (
          <div className="qz-modal-field">
            <div className="qz-modal-label">不正解の選択肢 *</div>
            {wrongChoices.map((wc, i) => (
              <input
                key={i}
                className={`qz-modal-input${formError && !wc.trim() ? ' qz-modal-input--error' : ''}`}
                style={{ marginBottom: 10 }}
                value={wc}
                onChange={e => handleWrongChoiceChange(i, e.target.value)}
                placeholder={`不正解 ${i + 1}`}
              />
            ))}
          </div>
        )}

        {/* カテゴリ */}
        <div className="qz-modal-field">
          <div className="qz-modal-label">カテゴリ（任意）</div>
          <input
            className="qz-modal-input"
            value={category}
            onChange={e => setCategory(e.target.value)}
            placeholder="例：数学, 英単語"
          />
        </div>

        {/* メモ */}
        <div className="qz-modal-field">
          <div className="qz-modal-label">メモ（任意）</div>
          <textarea
            className="qz-modal-textarea"
            style={{ minHeight: 72 }}
            value={memo}
            onChange={e => setMemo(e.target.value)}
            placeholder="補足・解説・覚え方など"
          />
        </div>

        <div className="qz-modal-btns">
          {modal.type === 'edit' && (
            <button className="qz-btn qz-btn--danger" onClick={() => onDelete(modal.problemId)}>
              削除
            </button>
          )}
          <button className="qz-btn" style={{ flex: 1 }} onClick={onClose} disabled={uploading}>キャンセル</button>
          <button className="qz-btn qz-btn--primary" style={{ flex: 2 }} onClick={handleSave} disabled={uploading}>
            {uploading ? 'アップロード中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
};
