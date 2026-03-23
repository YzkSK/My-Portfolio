import { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import '../app.css';

const FIREBASE_ERRORS: Record<string, string> = {
  'auth/user-not-found': 'メールアドレスまたはパスワードが違います',
  'auth/wrong-password': 'メールアドレスまたはパスワードが違います',
  'auth/invalid-credential': 'メールアドレスまたはパスワードが違います',
  'auth/email-already-in-use': 'このメールアドレスはすでに使用されています',
  'auth/too-many-requests': 'ログイン試行が多すぎます。しばらく待ってから再試行してください',
  'auth/network-request-failed': 'ネットワークエラーが発生しました',
};

type Strength = { score: number; label: string; color: string };

const getStrength = (pw: string): Strength => {
  const checks = [
    pw.length >= 8,
    /[A-Z]/.test(pw),
    /[a-z]/.test(pw),
    /[0-9]/.test(pw),
  ];
  const score = checks.filter(Boolean).length;
  if (score <= 1) return { score, label: '弱い', color: '#ef4444' };
  if (score <= 2) return { score, label: '普通', color: '#f59e0b' };
  if (score === 3) return { score, label: '強い', color: '#22c55e' };
  return { score, label: 'とても強い', color: '#3b82f6' };
};

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const navigate = useNavigate();

  const strength = getStrength(password);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!email.trim()) {
      e.email = 'メールアドレスを入力してください';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      e.email = 'メールアドレスの形式が正しくありません';
    }
    if (!password) {
      e.password = 'パスワードを入力してください';
    } else if (password.length < 8) {
      e.password = 'パスワードは8文字以上で入力してください';
    } else if (!/[A-Z]/.test(password)) {
      e.password = '大文字を1文字以上含めてください';
    } else if (!/[a-z]/.test(password)) {
      e.password = '小文字を1文字以上含めてください';
    } else if (!/[0-9]/.test(password)) {
      e.password = '数字を1文字以上含めてください';
    }
    if (isSignUp) {
      if (!confirmPassword) {
        e.confirmPassword = '確認用パスワードを入力してください';
      } else if (password !== confirmPassword) {
        e.confirmPassword = 'パスワードが一致しません';
      }
    }
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      navigate('/app/dashboard');
    } catch (err: unknown) {
      if (err instanceof Error) {
        const code = (err as { code?: string }).code ?? '';
        setErrors({ form: FIREBASE_ERRORS[code] ?? err.message });
      }
    }
  };

  const switchMode = () => {
    setIsSignUp(!isSignUp);
    setErrors({});
    setConfirmPassword('');
  };

  return (
    <div className="app-login">
      <div className="app-login-card">
        <h2>{isSignUp ? 'Sign Up' : 'Login'}</h2>
        {errors.form && <p className="app-error">{errors.form}</p>}
        <form onSubmit={handleSubmit} className="app-form" noValidate>
          <div className="app-field">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErrors(p => ({ ...p, email: '' })); }}
              className={errors.email ? 'app-input-error' : ''}
            />
            {errors.email && <span className="app-field-error">{errors.email}</span>}
          </div>
          <div className="app-field">
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErrors(p => ({ ...p, password: '' })); }}
              className={errors.password ? 'app-input-error' : ''}
            />
            {isSignUp && password && (
              <div className="app-strength">
                <div className="app-strength-bar">
                  {[1, 2, 3, 4].map(i => (
                    <div
                      key={i}
                      className="app-strength-segment"
                      style={{ background: i <= strength.score ? strength.color : '#333' }}
                    />
                  ))}
                </div>
                <span className="app-strength-label" style={{ color: strength.color }}>
                  {strength.label}
                </span>
              </div>
            )}
            {errors.password && <span className="app-field-error">{errors.password}</span>}
          </div>
          {isSignUp && (
            <div className="app-field">
              <input
                type="password"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setErrors(p => ({ ...p, confirmPassword: '' })); }}
                className={errors.confirmPassword ? 'app-input-error' : ''}
              />
              {errors.confirmPassword && <span className="app-field-error">{errors.confirmPassword}</span>}
            </div>
          )}
          <button type="submit">{isSignUp ? 'Sign Up' : 'Login'}</button>
        </form>
        <p className="app-toggle">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}
          <button onClick={switchMode}>
            {isSignUp ? 'Login' : 'Sign Up'}
          </button>
        </p>
      </div>
    </div>
  );
};
