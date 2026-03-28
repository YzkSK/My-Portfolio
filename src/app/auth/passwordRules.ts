export type PasswordRule = {
  test: (pw: string) => boolean;
  errorMsg: string;
};

export const PASSWORD_RULES: PasswordRule[] = [
  { test: (pw) => pw.length >= 8,      errorMsg: 'パスワードは8文字以上で入力してください' },
  { test: (pw) => /[A-Z]/.test(pw),    errorMsg: '大文字を1文字以上含めてください' },
  { test: (pw) => /[a-z]/.test(pw),    errorMsg: '小文字を1文字以上含めてください' },
  { test: (pw) => /[0-9]/.test(pw),    errorMsg: '数字を1文字以上含めてください' },
];

export type Strength = { score: number; label: string; color: string };

export const getStrength = (pw: string): Strength => {
  const score = PASSWORD_RULES.filter(r => r.test(pw)).length;
  if (score <= 1) return { score, label: '弱い', color: '#ef4444' };
  if (score <= 2) return { score, label: '普通', color: '#f59e0b' };
  if (score === 3) return { score, label: '強い', color: '#22c55e' };
  return { score, label: 'とても強い', color: '#3b82f6' };
};
