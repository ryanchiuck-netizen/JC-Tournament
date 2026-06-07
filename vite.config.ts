import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  let publishTime = new Date().toISOString()
  const timeFile = path.resolve(process.cwd(), 'public/publish-time.json')

  if (command === 'build') {
    // When running production build, update the last live published time file
    publishTime = new Date().toISOString()
    try {
      fs.writeFileSync(timeFile, JSON.stringify({ publishTime }), 'utf-8')
    } catch (e) {
      console.error("Failed to write publish time file:", e)
    }
  } else {
    // In dev mode (draft within studio), read the last live published time to prevent showing draft times
    try {
      if (fs.existsSync(timeFile)) {
        const raw = fs.readFileSync(timeFile, 'utf-8')
        const data = JSON.parse(raw)
        if (data && data.publishTime) {
          publishTime = data.publishTime
        }
      } else {
        // If the file doesn't exist yet, save a stable baseline timestamp so it stays constant during draft edits
        fs.writeFileSync(timeFile, JSON.stringify({ publishTime }), 'utf-8')
      }
    } catch (e) {
      // Safe fallback
    }
  }

  return {
    plugins: [
      react(),
      tailwindcss()
    ],
    define: {
      'import.meta.env.VITE_PUBLISH_TIME': JSON.stringify(publishTime)
    }
  }
})
