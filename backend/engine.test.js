import { planDay } from './engine.js'

const summer = planDay({
  pvKwp: 4.8,
  tankLitres: 150,
  heaterKw: 2.2,
  startTemp: 22,
  targetTemp: 52,
  gridPrice: 0.32,
  feedInPrice: 0.079,
  deadlineHour: 7,
  useDeadlineBackup: true,
  useNightRate: false,
  profileId: 'june-clear'
})

if (summer.kpis.heatNeedKwh <= 0) throw new Error('heat need should be positive')
if (summer.kpis.savingsVsGridEur < 0) throw new Error('smart plan should not cost more than naive')
if (summer.hours.length !== 24) throw new Error('expected 24 hours')
if (!summer.schedule.length) throw new Error('expected a heating window')
if (!summer.strategies.find((s) => s.id === 'smart').reached) throw new Error('June surplus plan should hit target')

const winter = planDay({
  pvKwp: 9.6,
  tankLitres: 300,
  heaterKw: 3,
  startTemp: 18,
  targetTemp: 50,
  gridPrice: 0.32,
  feedInPrice: 0.079,
  nightPrice: 0.19,
  deadlineHour: 7,
  useDeadlineBackup: true,
  useNightRate: true,
  profileId: 'december'
})

if (winter.strategies.length !== 3) throw new Error('night compare should add a third strategy')
console.log('engine tests passed')
