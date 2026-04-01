import { GoogleGenerativeAI } from '@google/generative-ai';

import { MemoGenError, MEMO_GEN_ERROR_CODES } from './constants';

const MODEL = 'gemini-3.1-flash-lite-preview';

const PROMPT = (question: string, answer: string) =>
  `問題: ${question}\n答え: ${answer}\n\n上記の問題と答えについて、なぜその答えになるかを簡潔に解説してください。学習者が理解・記憶しやすいよう、関連する知識や覚え方のポイントも含めて日本語で説明してください。マークダウン記法は使わず、プレーンテキストで出力してください。`;

export { MemoGenError, MEMO_GEN_ERROR_CODES };

/**
 * Gemini を使ってメモ解説をストリーミング生成する。
 * @param question 問題文
 * @param answer   正解
 * @param onChunk  テキストチャンクを受け取るコールバック（累積テキストを渡す）
 */
export const generateMemoExplanation = async (
  question: string,
  answer: string,
  onChunk: (text: string) => void,
): Promise<void> => {
  const apiKey = import.meta.env.VITE_GOOGLE_GEMINI_API_KEY as string;
  if (!apiKey) throw new MemoGenError('no_api_key');

  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: MODEL });
  const result = await model.generateContentStream(PROMPT(question, answer));

  let text = '';
  for await (const chunk of result.stream) {
    text += chunk.text();
    onChunk(text);
  }
};
