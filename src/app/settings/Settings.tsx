import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  updateEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../shared/firebase';
import { useAuth } from '../auth/AuthContext';
import '../shared/app.css';

const Section = ({
  title,
  onSubmit,
  success,
  error,
  children,
}: {
  title: string;
  onSubmit: (e: React.FormEvent) => void;
  success?: string;
  error?: string;
  children: React.ReactNode;
}) => (
  <section className="app-settings-section">
    <h3 className="app-settings-section-title">{title}</h3>
    {error && <p className="app-error">{error}</p>}
    {success && <p className="app-settings-success">{success}</p>}
    <form onSubmit={onSubmit} className="app-form" noValidate>
      {children}
    </form>
  </section>
);

export const Settings = () => {
  const { currentUser, username: currentUsername } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState(currentUsername ?? '');
  const [usernameMsg, setUsernameMsg] = useState({ error: '', success: '' });

  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailMsg, setEmailMsg] = useState({ error: '', success: '' });

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState({ error: '', success: '' });

  const reauth = async (password: string) => {
    if (!currentUser?.email) throw new Error('ユーザー情報が取得できません');
    const credential = EmailAuthProvider.credential(currentUser.email, password);
    await reauthenticateWithCredential(currentUser, credential);
  };

  const handleUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    setUsernameMsg({ error: '', success: '' });
    if (!username.trim()) {
      setUsernameMsg({ error: 'ユーザー名を入力してください', success: '' });
      return;
    }
    try {
      await setDoc(
        doc(db, 'users', currentUser!.uid, 'profile', 'data'),
        { username: username.trim(), id: currentUser!.uid },
        { merge: true },
      );
      setUsernameMsg({ error: '', success: 'ユーザー名を更新しました' });
    } catch {
      setUsernameMsg({ error: 'ユーザー名の更新に失敗しました', success: '' });
    }
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailMsg({ error: '', success: '' });
    if (!newEmail.trim()) {
      setEmailMsg({ error: 'メールアドレスを入力してください', success: '' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      setEmailMsg({ error: 'メールアドレスの形式が正しくありません', success: '' });
      return;
    }
    if (!emailPassword) {
      setEmailMsg({ error: '現在のパスワードを入力してください', success: '' });
      return;
    }
    try {
      await reauth(emailPassword);
      await updateEmail(currentUser!, newEmail.trim());
      setNewEmail('');
      setEmailPassword('');
      setEmailMsg({ error: '', success: 'メールアドレスを更新しました' });
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? '';
      const msg =
        code === 'auth/wrong-password' || code === 'auth/invalid-credential'
          ? 'パスワードが違います'
          : code === 'auth/email-already-in-use'
          ? 'このメールアドレスはすでに使用されています'
          : 'メールアドレスの更新に失敗しました';
      setEmailMsg({ error: msg, success: '' });
    }
  };

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg({ error: '', success: '' });
    if (!currentPassword) {
      setPasswordMsg({ error: '現在のパスワードを入力してください', success: '' });
      return;
    }
    if (!newPassword) {
      setPasswordMsg({ error: '新しいパスワードを入力してください', success: '' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ error: 'パスワードが一致しません', success: '' });
      return;
    }
    try {
      await reauth(currentPassword);
      await updatePassword(currentUser!, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMsg({ error: '', success: 'パスワードを更新しました' });
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? '';
      const msg =
        code === 'auth/wrong-password' || code === 'auth/invalid-credential'
          ? '現在のパスワードが違います'
          : 'パスワードの更新に失敗しました';
      setPasswordMsg({ error: msg, success: '' });
    }
  };

  return (
    <div className="app-settings">
      <header className="app-header">
        <h1>Settings</h1>
        <button onClick={() => navigate('/app/dashboard')} className="app-logout-btn">
          戻る
        </button>
      </header>
      <main className="app-settings-main">
        <Section title="ユーザー名" onSubmit={handleUsername} {...usernameMsg}>
          <div className="app-field">
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <button type="submit">更新</button>
        </Section>

        <Section title="メールアドレス" onSubmit={handleEmail} {...emailMsg}>
          <div className="app-field">
            <input
              type="email"
              placeholder="新しいメールアドレス"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </div>
          <div className="app-field">
            <input
              type="password"
              placeholder="現在のパスワード"
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
            />
          </div>
          <button type="submit">更新</button>
        </Section>

        <Section title="パスワード" onSubmit={handlePassword} {...passwordMsg}>
          <div className="app-field">
            <input
              type="password"
              placeholder="現在のパスワード"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="app-field">
            <input
              type="password"
              placeholder="新しいパスワード"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="app-field">
            <input
              type="password"
              placeholder="新しいパスワード（確認）"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <button type="submit">更新</button>
        </Section>
      </main>
    </div>
  );
};
