import type { Messages } from './messages.ts';

/** 英語の辞書。ふりがなの記法は使わない（7.2） */
export const en: Messages = {
  siteName: 'Japan Local Specialties Map',
  map: {
    label: 'Map of Japan'
  },
  zoom: {
    in: '+',
    inLabel: 'Zoom in',
    out: '−',
    outLabel: 'Zoom out',
    reset: 'Show all'
  },
  regions: {
    hokkaido: 'Hokkaido',
    tohoku: 'Tohoku',
    kanto: 'Kanto',
    chubu: 'Chubu',
    kinki: 'Kinki',
    chugoku: 'Chugoku',
    shikoku: 'Shikoku',
    kyushu: 'Kyushu'
  },
  seas: {
    japanSea: 'Sea of Japan',
    pacific: 'Pacific Ocean'
  },
  card: {
    guide: {
      kids: 'Hover over or tap a prefecture!',
      adult: 'Hover over or tap a prefecture.'
    },
    distance: 'About %n km from Tokyo',
    maximize: 'Enlarge to see municipalities',
    restore: 'Back to original size',
    capital: 'Prefectural capital',
    access: 'Getting there from Tokyo',
    durationLabel: 'Estimated travel time',
    duration: {
      hoursMinutes: '%h hr %m min',
      hours: '%h hr',
      minutes: '%m min'
    },
    specialties: 'Specialties',
    spots: 'Sights',
    draft: 'Draft'
  },
  comingSoon: {
    label: 'Coming soon',
    indexSuffix: ' (coming soon)',
    card: {
      kids: 'Specialties and sights are coming soon!',
      adult: 'Specialties and sights are coming soon.'
    }
  },
  muni: {
    loading: 'Loading…',
    loadFailed: {
      kids: "Couldn't load the municipalities.",
      adult: 'Failed to load municipalities.'
    },
    offline: {
      kids: "You're offline, so this can't be shown.",
      adult: 'Unavailable while offline.'
    },
    retry: {
      kids: 'Try again',
      adult: 'Retry'
    },
    listSummary: 'List of municipalities (%n)'
  },
  index: {
    heading: 'Prefecture index'
  },
  notFound: {
    title: 'Page not found',
    backToTop: 'Back to home page'
  }
} satisfies Messages;
