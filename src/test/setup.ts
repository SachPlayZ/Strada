import '@testing-library/jest-dom/vitest'

if (!import.meta.env.VITE_GEMINI_API_KEY) {
  ;(import.meta.env as Record<string, string>).VITE_GEMINI_API_KEY = 'test-key'
}
