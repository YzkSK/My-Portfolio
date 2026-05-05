const DEFAULT_MODEL = 'gemini-3.1-flash-lite-preview';

export async function getGenerativeModel(modelName = DEFAULT_MODEL) {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const apiKey = import.meta.env.VITE_GOOGLE_GEMINI_API_KEY as string;
  if (!apiKey) throw new Error('NO_API_KEY');
  const client = new GoogleGenerativeAI(apiKey);
  return client.getGenerativeModel({ model: modelName });
}

/**
 * ストリーミングでモデル出力を受け取り、コールバックに累積テキストを渡す。
 */
export async function streamGenerate(model: any, prompt: string, onChunk: (text: string) => void) {
  const result = await model.generateContentStream(prompt);
  let text = '';
  for await (const chunk of result.stream) {
    text += chunk.text();
    onChunk(text);
  }
  return text;
}
