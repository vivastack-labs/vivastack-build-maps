import type { Messages } from './messages.ts';

/** 中国語（簡体字）の辞書。ふりがなの記法は使わない（7.2） */
export const zh: Messages = {
  siteName: '日本各地名产地图',
  map: {
    label: '日本地图'
  },
  zoom: {
    in: '+',
    inLabel: '放大',
    out: '−',
    outLabel: '缩小',
    reset: '全图'
  },
  regions: {
    hokkaido: '北海道地方',
    tohoku: '东北地方',
    kanto: '关东地方',
    chubu: '中部地方',
    kinki: '近畿地方',
    chugoku: '中国地方',
    shikoku: '四国地方',
    kyushu: '九州地方'
  },
  seas: {
    japanSea: '日本海',
    pacific: '太平洋'
  },
  card: {
    guide: {
      kids: '把鼠标移到都道府县上，或点一下吧',
      adult: '请将鼠标移到都道府县上，或点击选择'
    },
    distance: '距东京约 %n 公里',
    maximize: '放大查看市区町村',
    restore: '恢复原来大小',
    capital: '县厅所在地',
    access: '从东京出发的交通方式',
    durationLabel: '所需时间（参考）',
    duration: {
      hoursMinutes: '%h小时%m分钟',
      hours: '%h小时',
      minutes: '%m分钟'
    },
    specialties: '特产',
    spots: '名胜',
    draft: '草稿',
    sources: '出处',
    noSource: '无出处',
    accessed: '确认日期',
    loading: '加载中…',
    loadFailed: {
      kids: '没能加载详细内容',
      adult: '详细内容加载失败'
    },
    offline: {
      kids: '没有联网，所以无法显示',
      adult: '离线状态下无法显示'
    },
    retry: {
      kids: '再试一次',
      adult: '重试'
    },
    needsScript: {
      kids: '开启 JavaScript 就能看到详细内容哦',
      adult: '启用 JavaScript 后可查看详细内容'
    }
  },
  comingSoon: {
    label: '准备中',
    indexSuffix: '（准备中）',
    card: {
      kids: '名产和名胜正在准备中哦',
      adult: '名产和名胜正在准备中'
    }
  },
  muni: {
    loading: '加载中…',
    loadFailed: {
      kids: '没能加载市区町村',
      adult: '市区町村加载失败'
    },
    offline: {
      kids: '没有联网，所以无法显示',
      adult: '离线状态下无法显示'
    },
    retry: {
      kids: '再试一次',
      adult: '重试'
    },
    listSummary: '市区町村列表（%n）'
  },
  footer: {
    mapSource: {
      before: '出处：根据「国土数值信息（行政区域数据）」（日本国土交通省）（',
      after: '）加工制作'
    },
    ai: '由 AI 制作，并经人工确认',
    about: '关于本网站',
    privacy: '隐私政策',
    linksLabel: '网站信息'
  },
  about: {
    title: '关于本网站',
    site: {
      heading: '本网站',
      body: '「日本各地名产地图」可以让你从日本地图上查找全部 47 个都道府县的名产和名胜。网站提供儿童模式和成人模式，可以开关假名注音（日语的读音标注），并提供日语、英语和中文页面。'
    },
    content: {
      heading: '名产和名胜的文字',
      body: '名产和名胜的文字由 AI 制作，并经人工确认。每个项目的出处列在都道府县卡片的「出处」中。无法确认出处的项目会写明「无出处」。'
    },
    mapData: {
      heading: '地图数据',
      processedIntro: '我们对国土数值信息做了如下加工。',
      processedItems: [
        '为了方便在地图上查看，简化了形状。',
        '将市区町村的形状合并，制作出都道府县的形状。',
        '冲绳县没有画在实际位置，而是以相同大小画在地图左上方的方框内。',
        '面积不足 1 平方公里的岛屿，已从都道府县的形状中去除，但仍有少数保留。',
        '放不进全国地图的岛屿，已从全国地图中去除。'
      ],
      notOfficial: '加工后的数据并非由日本政府制作。'
    },
    boundary: {
      heading: '边界尚未确定的地区',
      body: '原始数据中有边界尚未确定的地区，部分边界线是暂定画出的。本地图直接使用了这些数据。'
    },
    reading: {
      heading: '读音和都道府县厅的位置',
      soumu: {
        before: '出处：根据「全国地方公共团体代码」（日本总务省）（',
        after: '）加工制作'
      },
      gsi: {
        before: '出处：在地理院地图（日本国土地理院）（',
        after: '）上查询都道府县厅的位置后制作'
      },
      distance: '与东京的距离，是从东京都厅到各都道府县厅的直线距离，以 10 公里为单位取整。'
    }
  },
  privacy: {
    title: '隐私政策',
    analytics: {
      heading: '访问分析',
      body: '为了了解哪些页面被浏览，本网站使用 Cloudflare Web Analytics。它不使用 Cookie，也不会识别访问者个人。我们查看的是汇总后的页面路径、来源网站（引荐来源）、国家或地区、浏览器、操作系统、设备类型和页面显示速度。',
      detail: { before: '详情请参阅 Cloudflare 的说明（', after: '）。' }
    },
    cookies: {
      heading: 'Cookie',
      body: '本网站自身不设置 Cookie，因此不会显示征求 Cookie 同意的横幅。'
    },
    storage: {
      heading: '保存在你设备上的内容',
      intro: '本网站会在你设备的浏览器中保存以下内容。两者都只保存在你的设备中，不会发送到服务器。',
      items: ['模式和假名注音的设置（localStorage）。仅在你按下按钮时保存。', '为了离线也能使用而保存的页面、地图和卡片数据，以及用于管理它们的数据（Service Worker 缓存）。'],
      note: '你可以在浏览器的设置中删除它们。'
    },
    delivery: {
      heading: '网站托管与分发',
      body: '本网站通过 Cloudflare 的服务托管和分发。',
      processing: '为了分发网站，Cloudflare 会处理访问者的 IP 地址等连接信息。',
      detail: { before: '详情请参阅 Cloudflare 的隐私政策（', after: '）。' }
    },
    external: {
      heading: '外部网站',
      body: '出处等链接指向的网站，适用各自网站的政策。'
    },
    revised: '修订日期'
  },
  pwa: {
    shortName: '名产地图'
  },
  sheet: {
    expand: '展开',
    collapse: '收起',
    close: '关闭'
  },
  display: {
    label: '模式',
    kids: '儿童',
    adult: '成人',
    ruby: '注音假名'
  },
  // T3-07：言語切替のリストの名前（言語の名前そのものは `LANG_NAMES`）
  langSwitch: {
    label: '语言'
  },
  index: {
    heading: '都道府县索引'
  },
  notFound: {
    title: '找不到页面',
    description: '请确认网址是否正确。',
    backToTop: '返回日本地图'
  }
} satisfies Messages;
