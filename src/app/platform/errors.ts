/** エラーオブジェクトから Firebase エラーコード等を取り出す */
export function getErrorCode(e: unknown): string {
  if (e != null && typeof e === 'object' && 'code' in e)
    return String((e as { code: unknown }).code);
  if (e instanceof Error) return e.message;
  return String(e);
}

/** アプリが定義するエラーコード辞書の基底型 */
export type ErrorCodeMap = Record<string, string>;

/** エラーコード付きトーストメッセージを生成する */
export function errorMsg(message: string, code: string): string {
  return `${message} [${code}]`;
}
