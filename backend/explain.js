const GROQ_URL = process.env.USER_LLM_BASE_URL || 'https://api.groq.com/openai/v1'
const GROQ_MODELS = [
  process.env.USER_LLM_MODEL,
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b'
].filter(Boolean)

export function llmConfigured() {
  return Boolean(readKey())
}

export async function explainPlan(plan) {
  const facts = compactPlan(plan)
  const key = readKey()
  if (!key) {
    const err = new Error('USER_LLM_API_KEY is not set')
    err.status = 503
    throw err
  }

  const errors = []
  for (const model of unique(GROQ_MODELS)) {
    for (const extra of modelOptions(model)) {
      try {
        const text = await callGroq(key, model, facts, extra)
        return { text, model, source: 'groq' }
      } catch (err) {
        errors.push(`${model}: ${err.message}`)
      }
    }
  }

  const err = new Error(errors.join(' | ') || 'Groq request failed')
  err.status = 502
  throw err
}

function readKey() {
  const raw = process.env.USER_LLM_API_KEY || ''
  return raw.trim().replace(/^['"]|['"]$/g, '')
}

function modelOptions(model) {
  if (String(model).includes('gpt-oss')) {
    return [
      { max_completion_tokens: 2500, reasoning_effort: 'low' },
      { max_completion_tokens: 4000, reasoning_effort: 'low' }
    ]
  }
  return [{ max_completion_tokens: 800 }]
}

async function callGroq(key, model, facts, extra) {
  const res = await fetch(`${GROQ_URL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 1,
      messages: [
        {
          role: 'system',
          content:
            'Write a short customer email for HelioHeat. Use only the numbers given. English. No markdown. Three short paragraphs then sign HelioHeat. Output the email only.'
        },
        { role: 'user', content: emailPrompt(facts) }
      ],
      ...extra
    })
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = data?.error?.message || data?.error || `Groq HTTP ${res.status}`
    throw new Error(String(detail))
  }

  const text = extractText(data)
  if (!text) throw new Error('Empty Groq response')
  return text
}

function emailPrompt(facts) {
  return [
    'Write the email from these calculated numbers.',
    `Profile: ${facts.profile}`,
    `PV: ${facts.pvKwp} kWp`,
    `Tank: ${facts.tankLitres} L`,
    `Heat need: ${facts.heatNeedKwh} kWh`,
    `PV today: ${facts.pvDayKwh} kWh`,
    `Surplus: ${facts.surplusDayKwh} kWh`,
    `Smart cost EUR ${facts.smartCostEur}`,
    `Heat-now cost EUR ${facts.naiveCostEur}`,
    `Savings EUR ${facts.savingsVsHeatNowEur}`,
    `Surplus used ${facts.surplusUsedKwh} kWh`,
    `Grid used ${facts.gridUsedKwh} kWh`,
    `Tank end ${facts.tankEndTempC} C`,
    `Windows: ${(facts.runWindows || []).join('; ') || 'none'}`
  ].join('\n')
}

function extractText(data) {
  const message = data?.choices?.[0]?.message || {}
  const parts = []
  collect(message.content, parts)
  if (parts.length) return clean(parts)
  collect(message.reasoning, parts)
  collect(data?.choices?.[0]?.text, parts)
  return clean(parts)
}

function clean(parts) {
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function collect(value, parts) {
  if (!value) return
  if (typeof value === 'string') {
    const t = value.trim()
    if (t) parts.push(t)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collect(item, parts))
    return
  }
  if (typeof value === 'object') {
    collect(value.text, parts)
    collect(value.content, parts)
  }
}

function compactPlan(plan) {
  const smart = (plan.strategies || []).find((s) => s.id === 'smart') || {}
  const naive = (plan.strategies || []).find((s) => s.id === 'naive') || {}
  return {
    profile: plan.config?.profileLabel,
    pvKwp: plan.config?.pvKwp,
    tankLitres: plan.config?.tankLitres,
    heaterKw: plan.config?.heaterKw,
    targetTempC: plan.config?.targetTemp,
    heatNeedKwh: plan.kpis?.heatNeedKwh,
    pvDayKwh: plan.kpis?.pvDayKwh,
    surplusDayKwh: plan.kpis?.surplusDayKwh,
    savingsVsHeatNowEur: plan.kpis?.savingsVsGridEur,
    bestStrategy: plan.kpis?.bestStrategy,
    smartCostEur: smart.costEur,
    naiveCostEur: naive.costEur,
    surplusUsedKwh: smart.surplusUsedKwh,
    gridUsedKwh: smart.gridUsedKwh,
    tankEndTempC: smart.endTemp,
    reachedTarget: smart.reached,
    runWindows: (plan.schedule || []).map((b) => `${b.window} ${b.label} ${b.kwh} kWh`)
  }
}

function unique(list) {
  return [...new Set(list)]
}
