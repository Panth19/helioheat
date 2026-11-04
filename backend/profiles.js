export const PRESETS = [
  {
    id: 'berlin-apt-summer',
    name: 'Berlin apartment · June',
    blurb: '4.8 kWp balcony/roof, 150 L tank, weekday load',
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
  },
  {
    id: 'family-house-summer',
    name: 'Family house · June',
    blurb: '9.6 kWp south roof, 300 L tank',
    pvKwp: 9.6,
    tankLitres: 300,
    heaterKw: 3,
    startTemp: 28,
    targetTemp: 55,
    gridPrice: 0.32,
    feedInPrice: 0.079,
    nightPrice: 0.19,
    deadlineHour: 7,
    useDeadlineBackup: true,
    useNightRate: false,
    profileId: 'june-clear'
  },
  {
    id: 'family-house-winter',
    name: 'Family house · December',
    blurb: 'Low sun, morning showers still needed',
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
  },
  {
    id: 'overcast-shoulder',
    name: 'Apartment · March overcast',
    blurb: 'Thin surplus, deadline backup matters',
    pvKwp: 4.8,
    tankLitres: 150,
    heaterKw: 2.2,
    startTemp: 20,
    targetTemp: 50,
    gridPrice: 0.32,
    feedInPrice: 0.079,
    nightPrice: 0.22,
    deadlineHour: 7,
    useDeadlineBackup: true,
    useNightRate: true,
    profileId: 'march-overcast'
  }
]

export const PV_PROFILES = {
  'june-clear': {
    id: 'june-clear',
    label: 'Berlin · June · clear',
    kwhPerKwp: [0, 0, 0, 0, 0, 0.02, 0.09, 0.22, 0.38, 0.55, 0.68, 0.78, 0.84, 0.8, 0.7, 0.54, 0.36, 0.2, 0.08, 0.02, 0, 0, 0, 0]
  },
  'september': {
    id: 'september',
    label: 'Berlin · September',
    kwhPerKwp: [0, 0, 0, 0, 0, 0, 0.03, 0.12, 0.26, 0.4, 0.52, 0.6, 0.63, 0.58, 0.46, 0.32, 0.16, 0.05, 0, 0, 0, 0, 0, 0]
  },
  'march-overcast': {
    id: 'march-overcast',
    label: 'Berlin · March · overcast',
    kwhPerKwp: [0, 0, 0, 0, 0, 0, 0.01, 0.04, 0.08, 0.12, 0.16, 0.18, 0.19, 0.16, 0.12, 0.07, 0.03, 0, 0, 0, 0, 0, 0, 0]
  },
  december: {
    id: 'december',
    label: 'Berlin · December',
    kwhPerKwp: [0, 0, 0, 0, 0, 0, 0, 0, 0.03, 0.1, 0.18, 0.24, 0.26, 0.22, 0.14, 0.05, 0, 0, 0, 0, 0, 0, 0, 0]
  }
}

export const LOAD_PROFILE = [
  0.18, 0.14, 0.12, 0.11, 0.12, 0.2, 0.42, 0.78, 0.7, 0.38, 0.32, 0.34,
  0.4, 0.36, 0.33, 0.38, 0.52, 0.74, 0.95, 0.88, 0.7, 0.48, 0.34, 0.24
]

export function listProfiles() {
  return Object.values(PV_PROFILES).map(({ id, label, kwhPerKwp }) => ({
    id,
    label,
    dailyKwhPerKwp: round1(kwhPerKwp.reduce((a, b) => a + b, 0))
  }))
}

function round1(n) {
  return Math.round(n * 10) / 10
}
