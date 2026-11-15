// 7.3・D24・6.6 (2)：上限の長さまで埋めたダミーのコンテンツを作る（T3-08。HTML の大きさの実測用）。
// content/prefectures/ の47県の基本情報（県名・県庁）に、行き方1件・名物3件・名所3件を足して、--out に YAML で書く（コミットしない）。
// 解説文は 7.3 の上限の字数・語数ちょうど。日本語は漢字をすべてふりがなつきで書き、文字の約半分が漢字になるようにする。
// 乱数は固定のシード（既定 1）なので、毎回同じ内容になる。出力先は、リポジトリの外か、.gitignore されたリポジトリの中だけ。
// 実行：node scripts/make-max-content.ts --out <ディレクトリ> [--seed 1]
//   測る：CONTENT_DIR=<ディレクトリ> pnpm build && pnpm size（Node.js の型の除去で直接動かすので、enum などは使わない）
// 相対の import には .ts を付ける。
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { stringify } from 'yaml';
import { loadContent, type Prefecture } from '../src/lib/content.ts';
import type { Specialty, Spot } from '../src/lib/content-schema.generated.ts';
import { LENGTH_RANGES } from '../src/lib/content-rules.ts';
import { ACCESS_MODES, EMOJIS, EN_WORDS, JA_KANA_BY_LENGTH, JA_KANJI_WORDS, ZH_WORDS } from './max-content-words.ts';

type Lang = 'ja' | 'en' | 'zh';
type Mode = 'kids' | 'adult';
type Rng = () => number;
type Source = Specialty['sources'][number];
type Description = Specialty['description'];
type ItemKind = 'specialties' | 'spots';

/** 既定のシード */
export const DEFAULT_SEED = 1;

/** 出典のタイトルの字数（ふりがなを除く）と URL の長さ（4.11.7・9.3 の「約30字・約80字」） */
const SOURCE_TITLE_LENGTH = 30;
const SOURCE_URL_LENGTH = 80;
const SOURCES_PER_ITEM = 2;
const ITEMS_PER_LIST = 3;
/** 日本語の文のうち、漢字（ふりがなつき）にする字数の目安の割合 */
const KANJI_SHARE = 0.5;
const ITEM_IDS: Readonly<Record<ItemKind, readonly string[]>> = { specialties: ['specialty-a', 'specialty-b', 'specialty-c'], spots: ['spot-a', 'spot-b', 'spot-c'] };
const ACCESS_DURATION_MIN = 60;
const ACCESS_DURATION_SPAN = 400;
const ACCESSED_DATES = ['2026-11-15', '2026-11-10', '2026-10-28'];
const URL_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** 固定のシードから、0 以上 1 未満の数を返す関数を作る（mulberry32） */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)] as T;

/** 日本語の文。ふりがなを除いて length 字（terminator を含む）。漢字の語は必ず {漢字|よみ} にし、字数の約 KANJI_SHARE を漢字にする */
export function jaText(rng: Rng, length: number, terminator: string): string {
  const parts: string[] = [];
  let remaining = length - terminator.length;
  let written = 0;
  let kanji = 0;
  while (remaining > 0) {
    if (kanji <= written * KANJI_SHARE) {
      const [base, reading] = pick(
        rng,
        JA_KANJI_WORDS.filter(([word]) => word.length <= remaining)
      );
      parts.push(`{${base}|${reading}}`);
      kanji += base.length;
      written += base.length;
      remaining -= base.length;
    } else {
      const size = Math.min(remaining, 1 + Math.floor(rng() * 4)) as 1 | 2 | 3 | 4;
      parts.push(pick(rng, JA_KANA_BY_LENGTH[size]));
      written += size;
      remaining -= size;
    }
  }
  return parts.join('') + terminator;
}

/** 中国語の文。length 字（terminator を含む） */
export function zhText(rng: Rng, length: number, terminator: string): string {
  const parts: string[] = [];
  let remaining = length - terminator.length;
  while (remaining > 0) {
    const word = pick(
      rng,
      ZH_WORDS.filter(candidate => candidate.length <= remaining)
    );
    parts.push(word);
    remaining -= word.length;
  }
  return parts.join('') + terminator;
}

const capitalize = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/** 英語の文。ちょうど words 語。頭を大文字に、終わりをピリオドにする */
export function enSentence(rng: Rng, words: number): string {
  const list = Array.from({ length: words }, () => pick(rng, EN_WORDS));
  return `${[capitalize(list[0] ?? ''), ...list.slice(1)].join(' ')}.`;
}

/** 3言語・2モードの解説文。上限は 7.3 の `LENGTH_RANGES` */
function description(rng: Rng, kind: ItemKind): Description {
  const max = (lang: Lang, mode: Mode): number => LENGTH_RANGES[kind][lang][mode][1];
  const byMode = (make: (mode: Mode) => string): { readonly kids: string; readonly adult: string } => ({ kids: make('kids'), adult: make('adult') });
  return {
    ja: byMode(mode => jaText(rng, max('ja', mode), '。')),
    en: byMode(mode => enSentence(rng, max('en', mode))),
    zh: byMode(mode => zhText(rng, max('zh', mode), '。'))
  };
}

/** 名前（2語）。ja は漢字の語2つ（ふりがなつき）、en は2語、zh は漢字2語 */
function name(rng: Rng): { readonly ja: string; readonly en: string; readonly zh: string } {
  return { ja: jaText(rng, 2 + Math.floor(rng() * 3), ''), en: [capitalize(pick(rng, EN_WORDS)), pick(rng, EN_WORDS)].join(' '), zh: zhText(rng, 2 + Math.floor(rng() * 3), '') };
}

/** 出典を SOURCES_PER_ITEM 件。URL は SOURCE_URL_LENGTH 字（ランダムな末尾で、同じ文字列の繰り返しを避ける） */
function sources(rng: Rng, prefId: string, itemId: string): Source[] {
  return Array.from({ length: SOURCES_PER_ITEM }, (_, i): Source => {
    const head = `https://www.example.jp/${prefId}/${itemId}/${i === 0 ? 'a' : 'b'}/`;
    const tail = Array.from({ length: SOURCE_URL_LENGTH - head.length }, () => pick(rng, [...URL_CHARS])).join('');
    return { title: jaText(rng, SOURCE_TITLE_LENGTH, ''), url: head + tail, accessed: pick(rng, ACCESSED_DATES) };
  });
}

function item(rng: Rng, prefId: string, kind: ItemKind, index: number): Specialty | Spot {
  const id = ITEM_IDS[kind][index] ?? '';
  return { id, emoji: pick(rng, EMOJIS), name: name(rng), description: description(rng, kind), sources: sources(rng, prefId, id), status: 'reviewed' };
}

function access(rng: Rng, base: Prefecture): NonNullable<Prefecture['access']> {
  const [emoji, ja, en, zh] = pick(rng, ACCESS_MODES);
  return {
    emoji,
    mode: { ja, en, zh },
    route: { ja: `{羽田空港|はねだくうこう} → ${base.capital.name.ja}`, en: `Haneda Airport → ${base.capital.name.en}`, zh: `羽田机场 → ${base.capital.name.zh}` },
    durationMin: ACCESS_DURATION_MIN + Math.floor(rng() * ACCESS_DURATION_SPAN),
    sources: sources(rng, base.id, 'access'),
    status: 'reviewed'
  };
}

/**
 * 県の基本情報（県名・県庁など）に、行き方・名物・名所を足す。すべて reviewed、解説文は上限の長さ、出典は各項目2件。
 * 入力は変えない。同じシードなら同じ内容になる
 */
export function makeMaxContent(base: readonly Prefecture[], seed: number): readonly Prefecture[] {
  const rng = createRng(seed);
  return base.map((pref): Prefecture => ({
    id: pref.id,
    code: pref.code,
    region: pref.region,
    name: pref.name,
    capital: pref.capital,
    access: access(rng, pref),
    specialties: Array.from({ length: ITEMS_PER_LIST }, (_, i) => item(rng, pref.id, 'specialties', i)) as Prefecture['specialties'],
    spots: Array.from({ length: ITEMS_PER_LIST }, (_, i) => item(rng, pref.id, 'spots', i)) as Prefecture['spots']
  }));
}

const HEADER = '# make-max-content.ts が作った、上限まで埋めたダミーのコンテンツ（T3-08）。文は無意味で、事実の確認も出典の確認もしていない。コミットしない\n';

/** 県ごとに `NN-id.yaml` を dir に書く（dir がなければ作る） */
export function writeMaxContent(dir: string, prefectures: readonly Prefecture[]): void {
  mkdirSync(dir, { recursive: true });
  prefectures.forEach(pref => writeFileSync(join(dir, `${pref.code}-${pref.id}.yaml`), `${HEADER}---\n${stringify(pref, { lineWidth: 0 })}`));
}

/** path が git の .gitignore で無視される場所か（`git check-ignore`） */
export function isGitIgnored(path: string, repoRoot: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '--quiet', '--', path], { cwd: repoRoot, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** 出力先がリポジトリの中なら、.gitignore されている場所だけ許す（ダミーのコンテンツをコミットしないため）。許さなければ例外 */
export function assertSafeOutDir(out: string, { repoRoot, isIgnored }: { readonly repoRoot: string; readonly isIgnored: (path: string) => boolean }): void {
  const path = relative(resolve(repoRoot), resolve(out));
  const isInside = path === '' || (!path.startsWith('..') && !isAbsolute(path));
  if (isInside && !isIgnored(resolve(out))) {
    throw new Error(`${out} はリポジトリの中で、.gitignore されていません。リポジトリの外か、tmp/ など .gitignore された場所を指定してください`);
  }
}

/** run の出力先 */
export type Io = { readonly write: (line: string) => void; readonly warn: (line: string) => void };

/** run の依存（テストで置き換える） */
export type Deps = {
  readonly base?: readonly Prefecture[];
  readonly repoRoot?: string;
  readonly isIgnored?: (path: string) => boolean;
};

const REPO_ROOT = join(import.meta.dirname, '..');

/** 引数を確かめて書き出し、終了コードを返す（0：書いた、2：引数・出力先の誤り） */
export function run(argv: readonly string[], io: Io, deps: Deps = {}): number {
  try {
    const { values } = parseArgs({ args: [...argv], options: { out: { type: 'string' }, seed: { type: 'string' } }, strict: true });
    if (values.out === undefined || values.out === '') throw new Error('--out に出力先のディレクトリを指定してください');
    const seed = values.seed === undefined ? DEFAULT_SEED : Number(values.seed);
    if (!Number.isInteger(seed)) throw new Error(`--seed は整数にしてください：${String(values.seed)}`);
    const repoRoot = deps.repoRoot ?? REPO_ROOT;
    assertSafeOutDir(values.out, { repoRoot, isIgnored: deps.isIgnored ?? (path => isGitIgnored(path, repoRoot)) });
    const prefectures = makeMaxContent(deps.base ?? loadContent(join(REPO_ROOT, 'content/prefectures')), seed);
    writeMaxContent(values.out, prefectures);
    io.write(`${prefectures.length}県のダミーのコンテンツを ${values.out} に書きました（シード ${seed}）`);
    return 0;
  } catch (error) {
    io.warn(error instanceof Error ? error.message : String(error));
    return 2;
  }
}

if (import.meta.main) {
  process.exitCode = run(process.argv.slice(2), { write: line => process.stdout.write(`${line}\n`), warn: line => process.stderr.write(`${line}\n`) });
}
