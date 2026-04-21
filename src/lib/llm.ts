import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import type { ZodType } from 'zod'

export function createLLM(): ChatGoogleGenerativeAI {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('VITE_GEMINI_API_KEY is not set. Add it to .env.local.')
  }
  return new ChatGoogleGenerativeAI({
    model: 'gemini-2.0-flash',
    temperature: 0.2,
    apiKey,
  })
}

export function withStructuredOutput<T>(schema: ZodType<T>) {
  return createLLM().withStructuredOutput(schema)
}
