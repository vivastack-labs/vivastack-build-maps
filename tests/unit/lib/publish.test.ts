import { describe, expect, test } from 'vitest';
import type { Prefecture } from '@/lib/content-schema.generated';
import { buildTarget, isComplete, publish } from '@/lib/publish';
import { loadContent } from '@/lib/content';
import { FIXTURE_DIR } from './content-helpers';

type Status = Prefecture['specialties'][number]['status'];

const text = (value: string) => ({ ja: value, en: value, zh: value });
const description = (value: string) => ({ ja: { kids: value, adult: value }, en: { kids: value, adult: value }, zh: { kids: value, adult: value } });

const specialty = (id: string, status: Status): Prefecture['specialties'][number] => ({
  id,
  emoji: '🍙',
  name: text(id),
  description: description(`${id} の解説`),
  sources: [],
  status
});
const spot = (id: string, status: Status): Prefecture['spots'][number] => ({ id, name: text(id), description: description(`${id} の解説`), sources: [], status });
const access = (status: Status): NonNullable<Prefecture['access']> => ({ emoji: '🚃', mode: text('電車'), route: text('経路'), durationMin: 60, sources: [], status });

type Statuses = { readonly access?: Status | null; readonly specialties?: readonly Status[]; readonly spots?: readonly Status[] };

/** 項目ごとの status を指定して、県を作る（access に null を渡すと行き方を書かない） */
function pref(code: string, { access: accessStatus = 'reviewed', specialties = ['reviewed', 'reviewed', 'reviewed'], spots = ['reviewed', 'reviewed', 'reviewed'] }: Statuses = {}): Prefecture {
  return {
    id: `pref-${code}`,
    code,
    region: 'kanto',
    name: text(`県${code}`),
    capital: { name: text('県庁'), lat: 35, lon: 139 },
    ...(accessStatus === null ? {} : { access: access(accessStatus) }),
    specialties: specialties.map((status, i) => specialty(`s${i}`, status)),
    spots: spots.map((status, i) => spot(`p${i}`, status))
  };
}

describe('buildTarget', () => {
  test('7.1: 未設定・空なら production', () => {
    expect(buildTarget({})).toBe('production');
    expect(buildTarget({ BUILD_TARGET: '' })).toBe('production');
  });

  test('7.1: production・preview をそのまま返す', () => {
    expect(buildTarget({ BUILD_TARGET: 'production' })).toBe('production');
    expect(buildTarget({ BUILD_TARGET: 'preview' })).toBe('preview');
  });

  test('7.1: それ以外の値は例外（下書きが外に出る側に倒さない。R1）', () => {
    expect(() => buildTarget({ BUILD_TARGET: 'staging' })).toThrow(/BUILD_TARGET/u);
    expect(() => buildTarget({ BUILD_TARGET: 'Preview' })).toThrow(/BUILD_TARGET/u);
  });
});

describe('isComplete', () => {
  test('7.1: 行き方・名物・名所がそろい、すべて reviewed なら true', () => {
    expect(isComplete(pref('01'))).toBe(true);
  });

  test('7.1: 1項目でも reviewed でなければ false', () => {
    expect(isComplete(pref('01', { access: 'verified' }))).toBe(false);
    expect(isComplete(pref('01', { specialties: ['reviewed', 'draft', 'reviewed'] }))).toBe(false);
    expect(isComplete(pref('01', { spots: ['reviewed', 'reviewed', 'verified'] }))).toBe(false);
  });

  test('7.1: 行き方がない・名物が空・名所が空なら false', () => {
    expect(isComplete(pref('01', { access: null }))).toBe(false);
    expect(isComplete(pref('01', { specialties: [] }))).toBe(false);
    expect(isComplete(pref('01', { spots: [] }))).toBe(false);
  });
});

describe('publish', () => {
  test('7.1: 本番：全項目が reviewed の県は内容を出す（pending: false、draft: false）', () => {
    const [published] = publish([pref('01')], 'production');

    expect(published?.pending).toBe(false);
    expect(published?.access?.draft).toBe(false);
    expect(published?.specialties).toHaveLength(3);
    expect(published?.spots).toHaveLength(3);
    expect([...(published?.specialties ?? []), ...(published?.spots ?? [])].every(item => !item.draft)).toBe(true);
  });

  const oneUnreviewed: readonly (readonly [string, Statuses])[] = [
    ['行き方', { access: 'verified' }],
    ['名物', { specialties: ['reviewed', 'verified', 'reviewed'] }],
    ['名所', { spots: ['draft', 'reviewed', 'reviewed'] }]
  ];
  for (const [label, statuses] of oneUnreviewed) {
    test(`7.1・4.11.4: 本番：${label}の1項目だけ reviewed でない県は「準備中」になり、名物・名所・行き方を1つも含まない`, () => {
      const [published] = publish([pref('13', statuses)], 'production');

      expect(published?.pending).toBe(true);
      expect(published?.specialties).toEqual([]);
      expect(published?.spots).toEqual([]);
      expect(published).not.toHaveProperty('access');
      // 県名・県庁など、準備中でも出す基本情報は残る
      expect(published?.name.ja).toBe('県13');
      expect(published?.capital.lat).toBe(35);
    });
  }

  test('4.11.4: 本番：名物・名所が空（未作成）の県は「準備中」', () => {
    const [published] = publish([pref('47', { access: null, specialties: [], spots: [] })], 'production');

    expect(published?.pending).toBe(true);
    expect(published?.specialties).toEqual([]);
    expect(published?.spots).toEqual([]);
  });

  test('4.11.4: 本番：行き方がない県は「準備中」', () => {
    const [published] = publish([pref('02', { access: null })], 'production');

    expect(published?.pending).toBe(true);
    expect(published?.specialties).toEqual([]);
  });

  test('7.1: プレビュー：すべての県・項目を出し、reviewed でない項目に draft が付く（pending は常に false）', () => {
    const complete = pref('01');
    const mixed = pref('13', { access: 'draft', specialties: ['reviewed', 'verified', 'draft'], spots: ['reviewed', 'reviewed', 'verified'] });
    const empty = pref('47', { access: null, specialties: [], spots: [] });

    const [a, b, c] = publish([complete, mixed, empty], 'preview');

    expect([a?.pending, b?.pending, c?.pending]).toEqual([false, false, false]);
    expect(a?.specialties.map(item => item.draft)).toEqual([false, false, false]);
    expect(b?.access?.draft).toBe(true);
    expect(b?.specialties.map(item => item.draft)).toEqual([false, true, true]);
    expect(b?.spots.map(item => item.draft)).toEqual([false, false, true]);
    expect(b?.specialties.map(item => item.id)).toEqual(['s0', 's1', 's2']);
    expect(c?.specialties).toEqual([]);
    expect(c).not.toHaveProperty('access');
  });

  test('入力を変えない', () => {
    const input = [pref('01'), pref('13', { specialties: ['reviewed', 'verified', 'reviewed'] })];
    const snapshot = structuredClone(input);

    publish(input, 'production');
    publish(input, 'preview');

    expect(input).toEqual(snapshot);
  });

  test('県の順番を保つ', () => {
    const input = [pref('05'), pref('01', { access: null }), pref('13')];

    expect(publish(input, 'production').map(item => item.code)).toEqual(['05', '01', '13']);
    expect(publish(input, 'preview').map(item => item.code)).toEqual(['05', '01', '13']);
  });

  test('フィクスチャ：本番は北海道だけが内容を出す（東京都は混在、沖縄県は未作成）', () => {
    const published = publish(loadContent(FIXTURE_DIR), 'production');

    expect(published.filter(item => !item.pending).map(item => item.code)).toEqual(['01']);
    expect(published).toHaveLength(47);
  });
});
