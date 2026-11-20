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
    draft: 'Draft',
    sources: 'Sources',
    noSource: 'No source',
    accessed: 'Accessed',
    loading: 'Loading…',
    loadFailed: {
      kids: "Couldn't load the details.",
      adult: 'Failed to load the details.'
    },
    offline: {
      kids: "You're offline, so this can't be shown.",
      adult: 'Unavailable while offline.'
    },
    retry: {
      kids: 'Try again',
      adult: 'Retry'
    },
    needsScript: {
      kids: 'Turn on JavaScript to read the details!',
      adult: 'Enable JavaScript to read the details.'
    }
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
  footer: {
    mapSource: {
      before: 'Source: Created by processing "National Land Numerical Information (Administrative Area Data)" (Ministry of Land, Infrastructure, Transport and Tourism) (',
      after: ')'
    },
    ai: 'Created with AI and checked by people',
    about: 'About this site',
    privacy: 'Privacy policy',
    linksLabel: 'Site information'
  },
  about: {
    title: 'About this site',
    site: {
      heading: 'This site',
      body: '"Japan Local Specialties Map" lets you find the local specialties and sights of all 47 prefectures from a map of Japan. It has a kids mode and an adult mode, furigana (reading aids for Japanese) that you can turn on or off, and pages in Japanese, English, and Chinese.'
    },
    content: {
      heading: 'Specialties and sights',
      body: 'The text about specialties and sights is created with AI and checked by people. The sources for each item are listed under "Sources" on the prefecture card. Items whose sources could not be confirmed say "No source".'
    },
    mapData: {
      heading: 'Map data',
      processedIntro: 'We processed the National Land Numerical Information as follows.',
      processedItems: [
        'We simplified the shapes so that they are easy to see on a map.',
        'We created the prefecture shapes by combining the shapes of the municipalities.',
        'Okinawa is drawn at the same size, but inside a frame in the upper left of the map, not at its real position.',
        'Islands with an area of less than 1 km² are left out of the prefecture shapes. A few of them remain.',
        'Islands that do not fit inside the map of the whole country are left out of that map.'
      ],
      notOfficial: 'The processed data was not created by the national government.'
    },
    boundary: {
      heading: 'Areas with undetermined boundaries',
      body: 'The original data includes areas whose boundaries have not been determined, and some boundary lines are drawn provisionally. This map uses that data as it is.'
    },
    reading: {
      heading: 'Readings and prefectural government office locations',
      soumu: {
        before: 'Source: Created by processing "National Local Government Codes" (Ministry of Internal Affairs and Communications) (',
        after: ')'
      },
      gsi: {
        before: 'Source: Prefectural government office locations were looked up on GSI Maps (Geospatial Information Authority of Japan) (',
        after: ')'
      },
      distance: 'The distance from Tokyo is the straight-line distance from the Tokyo Metropolitan Government Building to each prefectural government office, rounded to the nearest 10 km.'
    }
  },
  privacy: {
    title: 'Privacy policy',
    analytics: {
      heading: 'Analytics',
      body: 'To learn which pages are viewed, this site uses Cloudflare Web Analytics. It does not use cookies and does not identify visitors as individuals. We look at aggregated data on the page path, the referrer (the site a visitor came from), the country, the browser, the OS, the device type, and the page load speed.',
      detail: { before: 'For details, see the Cloudflare documentation (', after: ').' }
    },
    cookies: {
      heading: 'Cookies',
      body: 'This site itself does not set any cookies. For this reason, it does not show a cookie consent banner.'
    },
    storage: {
      heading: 'What is saved on your device',
      intro: 'This site saves the following in the browser on your device. Both stay on your device and are not sent to the server.',
      items: [
        'Your mode and furigana settings (localStorage). They are saved only when you press a button.',
        'The pages, maps, and card data that let the site work offline, and the data used to manage them (Service Worker cache).'
      ],
      note: 'You can delete them in your browser settings.'
    },
    delivery: {
      heading: 'Hosting',
      body: 'This site is hosted and delivered using Cloudflare services.',
      processing: "To deliver the site, Cloudflare handles connection information such as the visitor's IP address.",
      detail: { before: 'For details, see the Cloudflare privacy policy (', after: ').' }
    },
    external: {
      heading: 'External sites',
      body: 'The sites linked from this site, such as the sources, follow their own policies.'
    },
    revised: 'Last updated'
  },
  pwa: {
    shortName: 'Meibutsu Map'
  },
  sheet: {
    expand: 'More',
    collapse: 'Less',
    close: 'Close'
  },
  display: {
    label: 'Mode',
    kids: 'Kids',
    adult: 'Adults',
    ruby: 'Furigana'
  },
  // T3-07：言語切替のリストの名前（言語の名前そのものは `LANG_NAMES`）
  langSwitch: {
    label: 'Language'
  },
  index: {
    heading: 'Prefecture index'
  },
  notFound: {
    title: 'Page not found',
    description: 'Please check that the URL is correct.',
    backToTop: 'Back to the map of Japan'
  }
} satisfies Messages;
