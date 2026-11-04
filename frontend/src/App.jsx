import { useEffect, useMemo, useState } from 'react'

const EMPTY = {
  pvKwp: 4.8,
  tankLitres: 150,
  heaterKw: 2.2,
  startTemp: 22,
  targetTemp: 52,
  gridPrice: 0.32,
  feedInPrice: 0.079,
  nightPrice: 0.22,
  deadlineHour: 7,
  useDeadlineBackup: true,
  useNightRate: false,
  profileId: 'june-clear'
}

export default function App() {
  const [form, setForm] = useState(EMPTY)
  const [presets, setPresets] = useState([])
  const [profiles, setProfiles] = useState([])
  const [plan, setPlan] = useState(null)
  const [activePreset, setActivePreset] = useState('berlin-apt-summer')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [llmReady, setLlmReady] = useState(false)
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)

  useEffect(() => {
    fetch('/api/presets')
      .then((r) => r.json())
      .then((data) => {
        setPresets(data.presets || [])
        setProfiles(data.profiles || [])
      })
      .catch(() => setError('Could not load presets.'))
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => setLlmReady(Boolean(data.llm)))
      .catch(() => setLlmReady(false))
  }, [])

  useEffect(() => {
    runPlan(EMPTY)
  }, [])

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setActivePreset('')
  }

  function applyPreset(preset) {
    const next = {
      pvKwp: preset.pvKwp,
      tankLitres: preset.tankLitres,
      heaterKw: preset.heaterKw,
      startTemp: preset.startTemp,
      targetTemp: preset.targetTemp,
      gridPrice: preset.gridPrice,
      feedInPrice: preset.feedInPrice,
      nightPrice: preset.nightPrice,
      deadlineHour: preset.deadlineHour,
      useDeadlineBackup: preset.useDeadlineBackup,
      useNightRate: preset.useNightRate,
      profileId: preset.profileId
    }
    setForm(next)
    setActivePreset(preset.id)
    runPlan(next)
  }

  async function runPlan(payload) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error('Plan failed')
      setPlan(await res.json())
      setEmail('')
      setEmailError('')
    } catch {
      setError('Could not build a heating plan. Is the API running?')
    } finally {
      setLoading(false)
    }
  }

  async function writeEmail() {
    if (!plan) return
    setEmailLoading(true)
    setEmailError('')
    try {
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Explain failed')
      setEmail(data.text)
      setEmailError(data.text ? '' : (data.warning || data.error || 'Could not write the customer email.'))
    } finally {
      setEmailLoading(false)
    }
  }

  const maxBar = useMemo(() => {
    if (!plan) return 1
    return Math.max(
      0.8,
      ...plan.hours.map((h) => Math.max(h.pvKw, h.loadKw, h.surplusKw, h.smartHeatKw))
    )
  }, [plan])

  return (
    <div className="shell">
      <header className="hero">
        <div>
          <p className="kicker">HelioHeat · portfolio project for Novolto</p>
          <h1>Use surplus solar for hot water, not the grid.</h1>
          <p className="lede">
            Enter a household PV system and tank. HelioHeat plans when to run the immersion heater
            so morning showers are ready, surplus electricity is used first, and grid heat is only a backup.
          </p>
        </div>
        <div className="hero-card">
          <span>Typical June apartment save vs heat-now</span>
          <strong>{plan ? `€${plan.kpis.savingsVsGridEur.toFixed(2)} / day` : '—'}</strong>
          <span>Best strategy: {plan?.kpis.bestStrategy || 'calculating'}</span>
        </div>
      </header>

      <div className="layout">
        <aside className="panel">
          <h2>Household</h2>
          <div className="presets">
            {presets.map((preset) => (
              <button
                key={preset.id}
                className={`preset ${activePreset === preset.id ? 'active' : ''}`}
                onClick={() => applyPreset(preset)}
                type="button"
              >
                <b>{preset.name}</b>
                <small>{preset.blurb}</small>
              </button>
            ))}
          </div>

          <div className="field">
            <label>Weather / season profile</label>
            <select value={form.profileId} onChange={(e) => setField('profileId', e.target.value)}>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} · {p.dailyKwhPerKwp} kWh/kWp
                </option>
              ))}
            </select>
          </div>

          <div className="row2">
            <Field label="PV size (kWp)" value={form.pvKwp} onChange={(v) => setField('pvKwp', v)} step="0.1" />
            <Field label="Tank (litres)" value={form.tankLitres} onChange={(v) => setField('tankLitres', v)} />
            <Field label="Heater (kW)" value={form.heaterKw} onChange={(v) => setField('heaterKw', v)} step="0.1" />
            <Field label="Start temp (°C)" value={form.startTemp} onChange={(v) => setField('startTemp', v)} />
            <Field label="Target temp (°C)" value={form.targetTemp} onChange={(v) => setField('targetTemp', v)} />
            <Field label="Ready by (hour)" value={form.deadlineHour} onChange={(v) => setField('deadlineHour', v)} />
            <Field label="Grid €/kWh" value={form.gridPrice} onChange={(v) => setField('gridPrice', v)} step="0.01" />
            <Field label="Feed-in €/kWh" value={form.feedInPrice} onChange={(v) => setField('feedInPrice', v)} step="0.001" />
            <Field label="Night €/kWh" value={form.nightPrice} onChange={(v) => setField('nightPrice', v)} step="0.01" />
          </div>

          <label className="check">
            <input
              type="checkbox"
              checked={form.useDeadlineBackup}
              onChange={(e) => setField('useDeadlineBackup', e.target.checked)}
            />
            Morning deadline backup from grid
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={form.useNightRate}
              onChange={(e) => setField('useNightRate', e.target.checked)}
            />
            Compare a cheap night tariff
          </label>

          <button className="primary" type="button" disabled={loading} onClick={() => runPlan(form)}>
            {loading ? 'Planning…' : 'Build heating plan'}
          </button>
          {error ? <p className="error">{error}</p> : null}
        </aside>

        <main>
          {plan ? (
            <>
              <section className="kpis">
                <Kpi label="Heat needed" value={`${plan.kpis.heatNeedKwh} kWh`} />
                <Kpi label="PV today" value={`${plan.kpis.pvDayKwh} kWh`} />
                <Kpi label="Surplus" value={`${plan.kpis.surplusDayKwh} kWh`} />
                <Kpi label="PV used for water" value={`${plan.kpis.selfUsePct}%`} />
              </section>

              <section className="panel">
                <h2>24-hour surplus vs heating</h2>
                <svg className="chart" viewBox="0 0 720 280" role="img" aria-label="Hourly PV surplus and heating plan">
                  {plan.hours.map((h) => {
                    const x = 20 + h.hour * 28
                    const pvH = (h.pvKw / maxBar) * 180
                    const heatH = (h.smartHeatKw / maxBar) * 180
                    return (
                      <g key={h.hour}>
                        <rect x={x} y={220 - pvH} width="10" height={pvH} fill="#f0c27a" rx="2" />
                        <rect x={x + 11} y={220 - heatH} width="10" height={heatH} fill="#2f6b4f" rx="2" />
                        <text x={x + 8} y="248" textAnchor="middle" fontSize="9" fill="#5c6d63">
                          {h.hour}
                        </text>
                      </g>
                    )
                  })}
                  <text x="20" y="18" fontSize="12" fill="#5c6d63">kW</text>
                </svg>
                <div className="legend">
                  <span><i className="swatch" style={{ background: '#f0c27a' }} /> PV generation</span>
                  <span><i className="swatch" style={{ background: '#2f6b4f' }} /> Smart heating</span>
                  <span><i className="swatch" style={{ background: '#e08a2a' }} /> Surplus first</span>
                  <span><i className="swatch" style={{ background: '#9a4a3a' }} /> Grid backup</span>
                </div>

                <div className="cards">
                  {plan.strategies.map((s) => (
                    <article key={s.id} className={`strategy ${plan.kpis.bestStrategy === s.id ? 'best' : ''}`}>
                      <h3>{s.name}</h3>
                      <p>{s.summary}</p>
                      <b>€{s.costEur.toFixed(2)}</b>
                      <p>
                        Surplus {s.surplusUsedKwh} kWh · grid {s.gridUsedKwh} kWh · tank {s.endTemp} °C
                      </p>
                    </article>
                  ))}
                </div>

                <div className="insight">{plan.insight}</div>

                <div className="explain">
                  <div className="explain-head">
                    <h2>Customer email</h2>
                    <button type="button" className="ghost" disabled={emailLoading} onClick={writeEmail}>
                      {emailLoading ? 'Writing…' : 'Write from these numbers'}
                    </button>
                  </div>
                  <p className="explain-note">
                    {llmReady
                      ? 'Uses Groq only to turn the plan numbers into a short sales email. The heating schedule is still calculated, not guessed.'
                      : 'Optional. Add USER_LLM_API_KEY on the server to generate a customer email from this plan. The planner does not need AI.'}
                  </p>
                  {emailError ? <p className="error">{emailError}</p> : null}
                  {email ? <pre className="email">{email}</pre> : null}
                </div>

                <h2>Run window</h2>
                <div className="schedule">
                  {plan.schedule.length === 0 ? (
                    <p>No heating required with these settings.</p>
                  ) : (
                    plan.schedule.map((block) => (
                      <div className="block" key={`${block.start}-${block.source}`}>
                        <span>{block.window}</span>
                        <span>{block.label}</span>
                        <span className={`tag ${block.source}`}>{block.kwh} kWh</span>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </>
          ) : (
            <section className="panel">Loading plan…</section>
          )}
        </main>
      </div>
      <footer>
        HelioHeat is a demo planner for a Novolto-style surplus-solar hot-water product. Figures use Berlin-like PV shapes, not live meter data.
      </footer>
    </div>
  )
}

function Field({ label, value, onChange, step = '1' }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      />
    </div>
  )
}

function Kpi({ label, value }) {
  return (
    <div className="kpi">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  )
}
