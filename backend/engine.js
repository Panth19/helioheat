import { PV_PROFILES, LOAD_PROFILE } from './profiles.js'

const WATER_KJ_PER_L_K = 4.186
const TANK_LOSS_PER_HOUR = 0.18
const MIN_SURPLUS_KW = 0.25
const GRID_BACKUP_KW = 2.2

export function planDay(input) {
  const cfg = normalize(input)
  const pv = hourlyPv(cfg)
  const hours = buildHours(cfg, pv)
  const naive = runNaive(cfg, hours)
  const smart = runSmart(cfg, hours)
  const night = cfg.useNightRate ? runNight(cfg, hours) : null

  const compared = [naive, smart, night].filter(Boolean)
  const best = compared.reduce((a, b) => (b.costEur < a.costEur ? b : a))

  return {
    config: publicConfig(cfg),
    kpis: {
      heatNeedKwh: round2(cfg.heatNeedKwh),
      pvDayKwh: round2(sum(pv)),
      surplusDayKwh: round2(sum(hours.map((h) => h.surplusKw))),
      selfUsePct: pct(smart.surplusUsedKwh, sum(pv)),
      savingsVsGridEur: round2(naive.costEur - smart.costEur),
      bestStrategy: best.id
    },
    strategies: compared,
    hours: hours.map((h, i) => ({
      hour: i,
      pvKw: round3(h.pvKw),
      loadKw: round3(h.loadKw),
      surplusKw: round3(h.surplusKw),
      smartHeatKw: round3(smart.heatKw[i]),
      naiveHeatKw: round3(naive.heatKw[i]),
      nightHeatKw: night ? round3(night.heatKw[i]) : 0,
      tankTempSmart: round1(smart.tankTemp[i]),
      source: smart.source[i]
    })),
    schedule: scheduleFrom(smart),
    insight: insightText(cfg, naive, smart, night)
  }
}

function normalize(raw) {
  const pvKwp = clamp(num(raw.pvKwp, 4.8), 0.5, 30)
  const tankLitres = clamp(num(raw.tankLitres, 150), 50, 1000)
  const heaterKw = clamp(num(raw.heaterKw, 2.2), 0.5, 9)
  const startTemp = clamp(num(raw.startTemp, 22), 5, 70)
  const targetTemp = clamp(num(raw.targetTemp, 52), startTemp + 1, 75)
  const gridPrice = clamp(num(raw.gridPrice, 0.32), 0.05, 1)
  const feedInPrice = clamp(num(raw.feedInPrice, 0.079), 0, 0.4)
  const nightPrice = clamp(num(raw.nightPrice, 0.22), 0.05, 1)
  const deadlineHour = Math.round(clamp(num(raw.deadlineHour, 7), 0, 23))
  const profileId = PV_PROFILES[raw.profileId] ? raw.profileId : 'june-clear'
  const thermalCapKwhPerK = (tankLitres * WATER_KJ_PER_L_K) / 3600
  const heatNeedKwh =
    thermalCapKwhPerK * (targetTemp - startTemp) + thermalCapKwhPerK * TANK_LOSS_PER_HOUR * 24

  return {
    pvKwp,
    tankLitres,
    heaterKw,
    startTemp,
    targetTemp,
    gridPrice,
    feedInPrice,
    nightPrice,
    deadlineHour,
    useDeadlineBackup: Boolean(raw.useDeadlineBackup),
    useNightRate: Boolean(raw.useNightRate),
    profileId,
    heatNeedKwh,
    thermalCapKwhPerK
  }
}

function publicConfig(cfg) {
  return {
    pvKwp: cfg.pvKwp,
    tankLitres: cfg.tankLitres,
    heaterKw: cfg.heaterKw,
    startTemp: cfg.startTemp,
    targetTemp: cfg.targetTemp,
    gridPrice: cfg.gridPrice,
    feedInPrice: cfg.feedInPrice,
    nightPrice: cfg.nightPrice,
    deadlineHour: cfg.deadlineHour,
    useDeadlineBackup: cfg.useDeadlineBackup,
    useNightRate: cfg.useNightRate,
    profileId: cfg.profileId,
    profileLabel: PV_PROFILES[cfg.profileId].label
  }
}

function hourlyPv(cfg) {
  const shape = PV_PROFILES[cfg.profileId].kwhPerKwp
  return shape.map((k) => k * cfg.pvKwp)
}

function buildHours(cfg, pv) {
  return pv.map((pvKw, hour) => {
    const loadKw = LOAD_PROFILE[hour]
    return {
      hour,
      pvKw,
      loadKw,
      surplusKw: Math.max(0, pvKw - loadKw)
    }
  })
}

function runNaive(cfg, hours) {
  const heatKw = Array(24).fill(0)
  const source = Array(24).fill('idle')
  let remaining = cfg.heatNeedKwh
  let cost = 0
  let surplusUsed = 0
  let gridUsed = 0
  let feedInLost = 0

  for (let i = 0; i < 24 && remaining > 0.01; i++) {
    const use = Math.min(cfg.heaterKw, remaining)
    heatKw[i] = use
    const fromSurplus = Math.min(use, hours[i].surplusKw)
    const fromGrid = use - fromSurplus
    surplusUsed += fromSurplus
    gridUsed += fromGrid
    feedInLost += fromSurplus * cfg.feedInPrice
    cost += fromGrid * cfg.gridPrice + fromSurplus * cfg.feedInPrice
    source[i] = fromGrid > 0.05 ? (fromSurplus > 0.05 ? 'mixed' : 'grid') : 'surplus'
    remaining -= use
  }

  return pack('naive', 'Heat now', 'Runs the immersion heater as soon as the tank is below target.', cfg, hours, heatKw, source, cost, surplusUsed, gridUsed, feedInLost)
}

function runSmart(cfg, hours) {
  const heatKw = Array(24).fill(0)
  const source = Array(24).fill('idle')
  let remaining = cfg.heatNeedKwh
  let cost = 0
  let surplusUsed = 0
  let gridUsed = 0
  let feedInLost = 0

  const ranked = hours
    .map((h, i) => ({ i, surplus: h.surplusKw }))
    .filter((h) => h.surplus >= MIN_SURPLUS_KW)
    .sort((a, b) => b.surplus - a.surplus)

  for (const slot of ranked) {
    if (remaining <= 0.01) break
    const use = Math.min(cfg.heaterKw, remaining, hours[slot.i].surplusKw)
    if (use < 0.15) continue
    heatKw[slot.i] = use
    source[slot.i] = 'surplus'
    surplusUsed += use
    feedInLost += use * cfg.feedInPrice
    cost += use * cfg.feedInPrice
    remaining -= use
  }

  if (cfg.useDeadlineBackup && remaining > 0.05) {
    const backupHours = nightHoursBefore(cfg.deadlineHour)
    for (const i of backupHours) {
      if (remaining <= 0.01) break
      if (heatKw[i] > 0) continue
      const use = Math.min(Math.min(cfg.heaterKw, GRID_BACKUP_KW), remaining)
      heatKw[i] = use
      source[i] = 'grid-backup'
      gridUsed += use
      cost += use * cfg.gridPrice
      remaining -= use
    }
  }

  if (remaining > 0.05) {
    for (let i = 0; i < 24 && remaining > 0.01; i++) {
      if (heatKw[i] > 0) continue
      const extra = Math.min(cfg.heaterKw, remaining)
      heatKw[i] = extra
      source[i] = 'grid'
      gridUsed += extra
      cost += extra * cfg.gridPrice
      remaining -= extra
    }
  }

  return pack('smart', 'Surplus first', 'Heats during the strongest PV surplus hours, then uses a morning deadline backup if needed.', cfg, hours, heatKw, source, cost, surplusUsed, gridUsed, feedInLost)
}

function runNight(cfg, hours) {
  const heatKw = Array(24).fill(0)
  const source = Array(24).fill('idle')
  let remaining = cfg.heatNeedKwh
  let cost = 0
  let surplusUsed = 0
  let gridUsed = 0
  let feedInLost = 0

  const nightSlots = [0, 1, 2, 3, 4, 5]
  for (const i of nightSlots) {
    if (remaining <= 0.01) break
    const use = Math.min(cfg.heaterKw, remaining)
    heatKw[i] = use
    source[i] = 'night-rate'
    gridUsed += use
    cost += use * cfg.nightPrice
    remaining -= use
  }

  const ranked = hours
    .map((h, i) => ({ i, surplus: h.surplusKw }))
    .filter((h) => h.surplus >= MIN_SURPLUS_KW && heatKw[h.i] === 0)
    .sort((a, b) => b.surplus - a.surplus)

  for (const slot of ranked) {
    if (remaining <= 0.01) break
    const use = Math.min(cfg.heaterKw, remaining, hours[slot.i].surplusKw)
    if (use < 0.15) continue
    heatKw[slot.i] = use
    source[slot.i] = 'surplus'
    surplusUsed += use
    feedInLost += use * cfg.feedInPrice
    cost += use * cfg.feedInPrice
    remaining -= use
  }

  return pack('night', 'Night rate + surplus', 'Prefills the tank on a cheap night tariff, then tops up from midday surplus.', cfg, hours, heatKw, source, cost, surplusUsed, gridUsed, feedInLost)
}

function pack(id, name, summary, cfg, hours, heatKw, source, cost, surplusUsed, gridUsed, feedInLost) {
  const tankTemp = simulateTank(cfg, heatKw)
  const exportedKwh = hours.reduce((acc, h, i) => acc + Math.max(0, h.surplusKw - heatKw[i]), 0)
  const peakTemp = Math.max(...tankTemp)
  const reached = peakTemp >= cfg.targetTemp - 0.4
  return {
    id,
    name,
    summary,
    costEur: round2(cost),
    surplusUsedKwh: round2(surplusUsed),
    gridUsedKwh: round2(gridUsed),
    feedInOpportunityEur: round2(feedInLost),
    exportLeftKwh: round2(exportedKwh),
    endTemp: round1(tankTemp[tankTemp.length - 1]),
    reached,
    heatKw,
    source,
    tankTemp
  }
}

function simulateTank(cfg, heatKw) {
  const temps = []
  let t = cfg.startTemp
  for (let i = 0; i < 24; i++) {
    t += heatKw[i] / cfg.thermalCapKwhPerK
    t -= TANK_LOSS_PER_HOUR
    t = Math.max(10, Math.min(80, t))
    temps.push(t)
  }
  return temps
}

function nightHoursBefore(deadline) {
  const hours = []
  for (let i = 1; i <= 6; i++) {
    hours.push((deadline - i + 24) % 24)
  }
  return hours
}

function scheduleFrom(smart) {
  const blocks = []
  let current = null
  for (let i = 0; i < 24; i++) {
    const src = smart.source[i]
    if (src === 'idle') {
      if (current) {
        blocks.push(current)
        current = null
      }
      continue
    }
    if (!current || current.source !== src) {
      if (current) blocks.push(current)
      current = {
        start: i,
        end: i + 1,
        source: src,
        kwh: smart.heatKw[i],
        label: sourceLabel(src)
      }
    } else {
      current.end = i + 1
      current.kwh += smart.heatKw[i]
    }
  }
  if (current) blocks.push(current)
  return blocks.map((b) => ({
    ...b,
    window: `${pad(b.start)}:00–${pad(b.end % 24)}:00`,
    kwh: round2(b.kwh)
  }))
}

function sourceLabel(source) {
  if (source === 'surplus') return 'PV surplus'
  if (source === 'grid-backup') return 'Deadline backup'
  if (source === 'night-rate') return 'Night tariff'
  if (source === 'mixed') return 'Surplus + grid'
  return 'Grid'
}

function insightText(cfg, naive, smart, night) {
  const save = naive.costEur - smart.costEur
  const bits = []
  if (save > 0.05) {
    bits.push(`Surplus-first heating saves €${save.toFixed(2)} vs turning the immersion on immediately.`)
  } else {
    bits.push('Today’s surplus is thin, so a deadline backup still has to buy some grid heat.')
  }
  bits.push(
    smart.reached
      ? `The tank still reaches ${smart.endTemp.toFixed(1)} °C by the end of the day.`
      : `The tank ends at ${smart.endTemp.toFixed(1)} °C — below the ${cfg.targetTemp} °C target. Raise heater power or enable night rate.`
  )
  if (night) {
    const nightDelta = smart.costEur - night.costEur
    if (nightDelta > 0.05) {
      bits.push(`A cheap night tariff would beat surplus-first by €${nightDelta.toFixed(2)} on this winter-like day.`)
    } else {
      bits.push('Night-rate preheat is not cheaper than waiting for surplus on this profile.')
    }
  }
  return bits.join(' ')
}

function num(v, fallback) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0)
}

function pct(part, whole) {
  if (whole <= 0) return 0
  return Math.round((part / whole) * 100)
}

function round1(n) {
  return Math.round(n * 10) / 10
}

function round2(n) {
  return Math.round(n * 100) / 100
}

function round3(n) {
  return Math.round(n * 1000) / 1000
}

function pad(n) {
  return String(n).padStart(2, '0')
}
