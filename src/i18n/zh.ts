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
    accessed: '确认日期'
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
    ai: '由 AI 制作，并经人工确认'
  },
  display: {
    label: '模式',
    kids: '儿童',
    adult: '成人',
    ruby: '注音假名'
  },
  index: {
    heading: '都道府县索引'
  },
  notFound: {
    title: '找不到页面',
    backToTop: '返回首页'
  }
} satisfies Messages;
