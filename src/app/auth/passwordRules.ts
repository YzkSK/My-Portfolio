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
