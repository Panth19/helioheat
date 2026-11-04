import express from 'express'
import cors from 'cors'
import path from 'path'
import { existsSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { planDay } from './engine.js'
import { PRESETS, listProfiles } from './profiles.js'
import { explainPlan, llmConfigured } from './explain.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
loadEnvFile(path.join(__dirname, '../.env'))
loadEnvFile(path.join(__dirname, '.env'))

const app = express()
const PORT = Number(process.env.PORT) || 3001
const dist = path.join(__dirname, '../frontend/dist')

app.use(cors())
app.use(express.json({ limit: '200kb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'helioheat', llm: llmConfigured() })
})

app.get('/api/presets', (_req, res) => {
  res.json({ presets: PRESETS, profiles: listProfiles() })
})

app.post('/api/plan', (req, res) => {
  try {
    res.json(planDay(req.body || {}))
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not build plan' })
  }
})

app.post('/api/explain', async (req, res) => {
  try {
    const plan = req.body?.plan || planDay(req.body || {})
    const result = await explainPlan(plan)
    res.json(result)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Explain failed' })
  }
})

if (existsSync(dist)) {
  app.use(express.static(dist))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(dist, 'index.html'))
  })
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`HelioHeat on ${PORT}${llmConfigured() ? ' · Groq email on' : ' · Groq email off'}`)
})

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return
  const text = readFileSync(filePath, 'utf8')
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}
