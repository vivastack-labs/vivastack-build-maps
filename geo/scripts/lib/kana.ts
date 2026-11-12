// 市区町村名の読みがな（ひらがな）とローマ字を、総務省のコード表のカナから作る（T1-02、開発概要書 7.4、D33）。
// ローマ字はヘボン式。長音を書かず、ん はいつも n にする。市・区・町・村はハイフンで分ける（U12）。

const KATAKANA = /[ァ-ヶ]/g;
const KATAKANA_TO_HIRAGANA_OFFSET = 0x60;

// 五十音の行ごとの、かな と ローマ字（空白区切り）。ん・っ・拗音は別に扱う
const MORA_ROWS: readonly (readonly [string, string])[] = [
  ['あいうえお', 'a i u e o'],
  ['かきくけこ', 'ka ki ku ke ko'],
  ['がぎぐげご', 'ga gi gu ge go'],
  ['さしすせそ', 'sa shi su se so'],
  ['ざじずぜぞ', 'za ji zu ze zo'],
  ['たちつてと', 'ta chi tsu te to'],
  ['だぢづでど', 'da ji zu de do'],
  ['なにぬねの', 'na ni nu ne no'],
  ['はひふへほ', 'ha hi fu he ho'],
  ['ばびぶべぼ', 'ba bi bu be bo'],
  ['ぱぴぷぺぽ', 'pa pi pu pe po'],
  ['まみむめも', 'ma mi mu me mo'],
  ['やゆよ', 'ya yu yo'],
  ['らりるれろ', 'ra ri ru re ro'],
  ['わを', 'wa o']
];

const MORA: ReadonlyMap<string, string> = new Map(MORA_ROWS.flatMap(([kana, romaji]) => zip([...kana], romaji.split(' '))));

// 拗音：い段の字の子音 ＋ 小書きの ゃゅょ の母音
const YOON_CONSONANT: ReadonlyMap<string, string> = new Map(Object.entries({ き: 'ky', し: 'sh', ち: 'ch', に: 'ny', ひ: 'hy', み: 'my', り: 'ry', ぎ: 'gy', じ: 'j', ぢ: 'j', び: 'by', ぴ: 'py' }));
const YOON_VOWEL: ReadonlyMap<string, string> = new Map(Object.entries({ ゃ: 'a', ゅ: 'u', ょ: 'o' }));

const SOKUON = 'っ';
const GEMINABLE = /^[kgsztdhfbpjc]/;
const HATSUON = 'ん';

// 名前の最後の字 → カナの終わりの読み（T1-02 で総務省のコード表の全件と合うことを確かめた）
const SUFFIX_READINGS: ReadonlyMap<string, readonly string[]> = new Map([
  ['市', ['し']],
  ['区', ['く']],
  ['町', ['ちょう', 'まち']],
  ['村', ['むら', 'そん']]
]);

type Token = { readonly kind: 'mora'; readonly romaji: string } | { readonly kind: 'hatsuon' } | { readonly kind: 'sokuon' };

/** 名前を語幹と接尾辞（市・町・村・区など）に分けたもの */
export type SplitName = { readonly stem: string; readonly suffix: string };

/**
 * 半角・全角のカタカナをひらがなにする。先に NFKC で正規化して、半角カナと濁点・半濁点を全角の1字にまとめる。
 * NFKC はカタカナ以外も変える（全角英数 → 半角、`㈱` → `(株)`）。カタカナ以外の字は、その後そのまま残す（「ー」を含む）。
 */
export function katakanaToHiragana(text: string): string {
  return text.normalize('NFKC').replace(KATAKANA, char => String.fromCharCode(char.charCodeAt(0) - KATAKANA_TO_HIRAGANA_OFFSET));
}

/** ひらがなをヘボン式のローマ字にする（先頭だけ大文字、長音は書かない）。対応しない字があればエラー。 */
export function hiraganaToRomaji(hiragana: string): string {
  if (hiragana.length === 0) {
    throw new Error('ローマ字にするひらがなが空です');
  }
  const tokens = tokenize(hiragana);
  validateSokuon(tokens, hiragana);
  const romaji = render(dropLongVowels(tokens));
  return romaji.charAt(0).toUpperCase() + romaji.slice(1);
}

/** 名前の最後の字（市・区・町・村）から、ひらがなの読みを語幹と接尾辞に分ける。合わなければエラー。 */
export function splitSuffix(name: string, kana: string): SplitName {
  const readings = SUFFIX_READINGS.get(name.slice(-1));
  if (readings === undefined) {
    throw new Error(`名前が市・区・町・村で終わっていません（${name}）`);
  }
  const suffix = readings.find(reading => kana.endsWith(reading));
  if (suffix === undefined) {
    throw new Error(`名前の接尾辞とカナの終わりが合わない（${name}・${kana}）`);
  }
  const stem = kana.slice(0, -suffix.length);
  if (stem.length === 0) {
    throw new Error(`接尾辞を除いた語幹が空です（${name}・${kana}）`);
  }
  return { stem, suffix };
}

/**
 * 市区町村名のローマ字（例：札幌市・さっぽろし → Sapporo-shi）。語幹と接尾辞を別々にローマ字にしてハイフンでつなぐ。
 * `kana` はひらがなで渡す。コード表のカナ（半角カタカナ）は、先に `katakanaToHiragana` を通す。
 */
export function municipalityRomaji(name: string, kana: string): string {
  const { stem, suffix } = splitSuffix(name, kana);
  return `${hiraganaToRomaji(stem)}-${hiraganaToRomaji(suffix).toLowerCase()}`;
}

function tokenize(hiragana: string): readonly Token[] {
  const chars = [...hiragana];
  const tokens: Token[] = [];
  for (let i = 0; i < chars.length; i += 1) {
    const char = chars[i] as string;
    const yoon = yoonRomaji(char, chars[i + 1]);
    if (yoon !== undefined) {
      tokens.push({ kind: 'mora', romaji: yoon });
      i += 1;
    } else {
      tokens.push(singleToken(char, hiragana));
    }
  }
  return tokens;
}

function yoonRomaji(char: string, next: string | undefined): string | undefined {
  const consonant = YOON_CONSONANT.get(char);
  const vowel = next === undefined ? undefined : YOON_VOWEL.get(next);
  return consonant === undefined || vowel === undefined ? undefined : consonant + vowel;
}

function singleToken(char: string, hiragana: string): Token {
  if (char === SOKUON) return { kind: 'sokuon' };
  if (char === HATSUON) return { kind: 'hatsuon' };
  if (YOON_VOWEL.has(char)) {
    throw new Error(`拗音の小書き「${char}」が、い段の字の後にありません（${hiragana}）`);
  }
  const romaji = MORA.get(char);
  if (romaji === undefined) {
    throw new Error(`ローマ字にできない文字「${char}」があります（${hiragana}）`);
  }
  return { kind: 'mora', romaji };
}

// 促音は、語の途中で、子音を重ねられる字（か・さ・た・は・ぱ行とその濁音）の前にだけ置ける。
// コード表に出てこない並び（語頭、母音・ん・や行・わ行・な行・ま行・ら行の前）は推測せずエラーにする（D33）
function validateSokuon(tokens: readonly Token[], hiragana: string): void {
  tokens.forEach((token, index) => {
    if (token.kind !== 'sokuon') return;
    const next = tokens[index + 1];
    if (index === 0 || next?.kind !== 'mora' || !GEMINABLE.test(next.romaji)) {
      throw new Error(`促音「っ」の位置が正しくありません（${hiragana}）`);
    }
  });
}

// D33：お段＋う・お段＋お は o、う段＋う は u にする（いい・ええ・えい・ああ は書く）。
// 直前に残した拍と比べるので、3つ以上続いても同じ規則になる（こうお → ko）
function dropLongVowels(tokens: readonly Token[]): readonly Token[] {
  return tokens.reduce<readonly Token[]>((kept, token) => {
    const previous = kept[kept.length - 1];
    const isDropped = token.kind === 'mora' && previous?.kind === 'mora' && isLongVowel(previous.romaji, token.romaji);
    return isDropped ? kept : [...kept, token];
  }, []);
}

function isLongVowel(previous: string, current: string): boolean {
  const lastVowel = previous.slice(-1);
  return (current === 'u' && (lastVowel === 'o' || lastVowel === 'u')) || (current === 'o' && lastVowel === 'o');
}

function render(tokens: readonly Token[]): string {
  return tokens
    .map((token, index) => {
      if (token.kind === 'hatsuon') return 'n';
      if (token.kind === 'mora') return token.romaji;
      const next = tokens[index + 1];
      return next?.kind === 'mora' ? geminate(next.romaji) : '';
    })
    .join('');
}

// 促音：次の子音を重ねる。ch の前は t にする（Hatcho）
function geminate(nextRomaji: string): string {
  return nextRomaji.startsWith('ch') ? 't' : nextRomaji.charAt(0);
}

function zip(keys: readonly string[], values: readonly string[]): (readonly [string, string])[] {
  if (keys.length !== values.length) {
    throw new Error(`かなとローマ字の数が合いません（${keys.join('')}）`);
  }
  return keys.map((key, index) => [key, values[index] as string] as const);
}
