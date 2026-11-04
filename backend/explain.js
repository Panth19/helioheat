const GROQ_URL = process.env.USER_LLM_BASE_URL || 'https://api.groq.com/openai/v1'
const GROQ_MODELS = [
  process.env.USER_LLM_MODEL,
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-20b'
].filter(Boolean)

export function llmConfigured() {
  return Boolean(readKey())
}

export async function explainPlan(plan) {
  const facts = compactPlan(plan)
  const key = readKey()
  if (!key) {
    return {
      text: localEmail(facts),
      source: 'local',
      warning: 'No Groq key loaded. Showing a local draft. Put USER_LLM_API_KEY in workspace/.env and restart node server.js.'
    }
  }

  let lastError = 'Groq request failed'
  for (const model of unique(GROQ_MODELS)) {
    try {
      const text = await callGroq(key, model, facts)
      return { text, model, source: 'groq' }
    } catch (err) {
      lastError = err.message || lastError
    }
  }

  return {
    text: localEmail(facts),
    source: 'local',
    warning: lastError
  }
}

function readKey() {
  const raw = process.env.USER_LLM_API_KEY || ''
  return raw.trim().replace(/^['"]|['"]$/g, '')
}

async function callGroq(key, model, facts) {
  const res = await fetch(`${GROQ_URL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 420,
      messages: [
        {
          role: 'system',
          content:
            'You write short customer emails for a Berlin surplus-solar hot-water product. Use only the numbers given. Do not invent hardware, sensors, savings, or weather. English. No markdown. Three short paragraphs: 1) what we modelled, 2) the recommended heating window and cost vs heating immediately, 3) one honest limit (demo PV shapes, not live meters). Sign off as HelioHeat.'
        },
        { role: 'user', content: JSON.stringify(facts) }
      ]
    })
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = data?.error?.message || data?.error || `Groq HTTP ${res.status}`
    throw new Error(String(detail))
  }

  const text = data?.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('Empty Groq response')
  return text
}

function localEmail(facts) {
  const windows = (facts.runWindows || []).join('; ') || 'no heating window'
  return [
    `Hello,\n\nWe modelled a ${facts.pvKwp} kWp system with a ${facts.tankLitres} L tank (${facts.profile || 'selected day'}). Heating the water needs about ${facts.heatNeedKwh} kWh. The day has about ${facts.pvDayKwh} kWh of PV and ${facts.surplusDayKwh} kWh of surplus after household load.`,
    `Recommended plan: run the immersion on surplus (${windows}). Cost about €${facts.smartCostEur} versus €${facts.naiveCostEur} if you heat immediately — about €${facts.savingsVsHeatNowEur} saved on this day. Surplus used for water: ${facts.surplusUsedKwh} kWh; grid backup: ${facts.gridUsedKwh} kWh. Tank ends near ${facts.tankEndTempC} °C.`,
    `This is a demo planner using Berlin-like PV shapes, not live meter data. A product like Novolto would connect the same logic to a real inverter and a smart relay.\n\nHelioHeat`
  ].join('\n\n')
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
