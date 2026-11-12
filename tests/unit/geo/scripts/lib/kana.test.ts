import { describe, expect, test } from 'vitest';
import { hiraganaToRomaji, katakanaToHiragana, municipalityRomaji, splitSuffix } from '../../../../../geo/scripts/lib/kana';

// 総務省のコード表のカナは、半角カタカナで濁点・半濁点が別の字（開発概要書 8.1、T1-01）
describe('katakanaToHiragana（F-TIP-02）', () => {
  test.each([
    ['ｻｯﾎﾟﾛｼ', 'さっぽろし'],
    ['ｻｯﾎﾟﾛｼﾁｭｳｵｳｸ', 'さっぽろしちゅうおうく'],
    ['ｶﾂﾞﾉｼ', 'かづのし'],
    ['トウキョウ', 'とうきょう']
  ])('F-TIP-02：カタカナ %s をひらがな %s にする', (katakana, expected) => {
    // Act
    const result = katakanaToHiragana(katakana);

    // Assert
    expect(result).toBe(expected);
  });

  test.each([
    ['ｺｰﾋｰ', 'こーひー'],
    ['コーヒー', 'こーひー']
  ])('F-TIP-02：カタカナをひらがなにするとき、長音記号「ー」は残す（%s）', (katakana, expected) => {
    // Act
    const result = katakanaToHiragana(katakana);

    // Assert
    expect(result).toBe(expected);
  });

  test('F-TIP-02：カタカナ以外の字はそのまま残す', () => {
    // Act
    const result = katakanaToHiragana('札幌ｼ abc');

    // Assert
    expect(result).toBe('札幌し abc');
  });
});

describe('hiraganaToRomaji（F-I18N-05・U12・D33）', () => {
  test.each([
    ['し', 'Shi'],
    ['ち', 'Chi'],
    ['つ', 'Tsu'],
    ['ふ', 'Fu'],
    ['じ', 'Ji'],
    ['ぢ', 'Ji'],
    ['づ', 'Zu'],
    ['を', 'O'],
    ['かづの', 'Kazuno'],
    ['おぢや', 'Ojiya']
  ])('F-I18N-05：%s は %s', (hiragana, expected) => {
    // Act
    const result = hiraganaToRomaji(hiragana);

    // Assert
    expect(result).toBe(expected);
  });

  test.each([
    ['しゃ', 'Sha'],
    ['ちょ', 'Cho'],
    ['じゅ', 'Ju'],
    ['きょ', 'Kyo'],
    ['りゅ', 'Ryu'],
    ['ぴゃ', 'Pya']
  ])('F-I18N-05：拗音 %s は %s', (hiragana, expected) => {
    // Act
    const result = hiraganaToRomaji(hiragana);

    // Assert
    expect(result).toBe(expected);
  });

  test.each([
    ['さっぽろ', 'Sapporo'],
    ['とっとり', 'Tottori'],
    ['べっぷ', 'Beppu'],
    ['いっしき', 'Isshiki']
  ])('F-I18N-05：促音は次の子音を重ねる（%s → %s）', (hiragana, expected) => {
    // Act
    const result = hiraganaToRomaji(hiragana);

    // Assert
    expect(result).toBe(expected);
  });

  test.each([
    ['はっちょう', 'Hatcho'],
    ['いっちょう', 'Itcho']
  ])('F-I18N-05：促音の次が ch なら tch にする（%s → %s）', (hiragana, expected) => {
    // Act
    const result = hiraganaToRomaji(hiragana);

    // Assert
    expect(result).toBe(expected);
  });

  test.each([
    ['とうきょう', 'Tokyo'],
    ['おおさか', 'Osaka'],
    ['ちゅうおう', 'Chuo'],
    ['きゅうしゅう', 'Kyushu'],
    ['こおりやま', 'Koriyama'],
    ['ゆうばり', 'Yubari'],
    ['こうお', 'Ko'],
    ['おうう', 'O']
  ])('U12・D33：長音を書かない（%s → %s）', (hiragana, expected) => {
    // Act
    const result = hiraganaToRomaji(hiragana);

    // Assert
    expect(result).toBe(expected);
  });

  test.each([
    ['いいだ', 'Iida'],
    ['いいづな', 'Iizuna'],
    ['ええ', 'Ee'],
    ['めいじ', 'Meiji'],
    ['ああ', 'Aa']
  ])('U12・D33：いい・ええ・えい・ああ は書く（%s → %s）', (hiragana, expected) => {
    // Act
    const result = hiraganaToRomaji(hiragana);

    // Assert
    expect(result).toBe(expected);
  });

  test.each([
    ['ぐんま', 'Gunma'],
    ['しんばし', 'Shinbashi'],
    ['なんよう', 'Nanyo'],
    ['かんおんじ', 'Kanonji'],
    ['てんえい', 'Tenei']
  ])('U12・D33：ん はいつも n にする（%s → %s）', (hiragana, expected) => {
    // Act
    const result = hiraganaToRomaji(hiragana);

    // Assert
    expect(result).toBe(expected);
  });

  test.each([
    ['カタカナ', 'サ'],
    ['漢字', '札'],
    ['英字', 'a'],
    ['空白', 'さ ぽ'],
    ['長音記号', 'こーひー'],
    ['小書きの ぁ', 'ふぁ'],
    ['ゔ', 'ゔ'],
    ['ゐ', 'ゐ']
  ])('F-I18N-05：ひらがな以外・対応しない文字（%s）が入っていたらエラーにする', (_label, input) => {
    // Act & Assert
    expect(() => hiraganaToRomaji(input)).toThrow(/ローマ字にできない文字/);
  });

  test('F-I18N-05：空文字はエラーにする', () => {
    // Act & Assert
    expect(() => hiraganaToRomaji('')).toThrow(/空/);
  });

  test.each(['さっ', 'さっあ', 'さっん', 'っ', 'っさ', 'さっっぽろ', 'さっや', 'さっわ', 'さっな'])('F-I18N-05：促音が語頭・最後や、子音を重ねられない字の前にあればエラーにする（%s）', input => {
    // Act & Assert
    expect(() => hiraganaToRomaji(input)).toThrow(/促音/);
  });

  test.each(['ゃ', 'あゅ', 'んょ'])('F-I18N-05：拗音の小書きが い段の字の後になければエラーにする（%s）', input => {
    // Act & Assert
    expect(() => hiraganaToRomaji(input)).toThrow(/拗音/);
  });
});

describe('splitSuffix（U12・D33）', () => {
  test.each([
    ['札幌市', 'さっぽろし', 'さっぽろ', 'し'],
    ['中央区', 'ちゅうおうく', 'ちゅうおう', 'く'],
    ['栗山町', 'くりやまちょう', 'くりやま', 'ちょう'],
    ['森町', 'もりまち', 'もり', 'まち'],
    ['天栄村', 'てんえいむら', 'てんえい', 'むら'],
    ['多良間村', 'たらまそん', 'たらま', 'そん']
  ])('U12・D33：%s（%s）を語幹 %s と接尾辞 %s に分ける', (name, kana, stem, suffix) => {
    // Act
    const result = splitSuffix(name, kana);

    // Assert
    expect(result).toEqual({ stem, suffix });
  });

  test.each([
    ['札幌市', 'さっぽろく'],
    ['中央区', 'ちゅうおうし'],
    ['栗山町', 'くりやまむら'],
    ['天栄村', 'てんえいちょう']
  ])('U12・D33：名前の接尾辞とカナの終わりが合わなければエラーにする（%s・%s）', (name, kana) => {
    // Act & Assert
    expect(() => splitSuffix(name, kana)).toThrow(/合わない/);
  });

  test.each([
    ['北海道', 'ほっかいどう'],
    ['', 'し']
  ])('U12・D33：市・区・町・村で終わらない名前はエラーにする（"%s"）', (name, kana) => {
    // Act & Assert
    expect(() => splitSuffix(name, kana)).toThrow(/市・区・町・村/);
  });

  test.each([
    ['市', 'し'],
    ['町', 'まち']
  ])('U12・D33：接尾辞を除いた語幹が空ならエラーにする（%s・%s）', (name, kana) => {
    // Act & Assert
    expect(() => splitSuffix(name, kana)).toThrow(/語幹/);
  });
});

describe('municipalityRomaji（F-I18N-05・U12・D33）', () => {
  test.each([
    ['札幌市', 'さっぽろし', 'Sapporo-shi'],
    ['中央区', 'ちゅうおうく', 'Chuo-ku'],
    ['森町', 'もりまち', 'Mori-machi'],
    ['栗山町', 'くりやまちょう', 'Kuriyama-cho'],
    ['天栄村', 'てんえいむら', 'Tenei-mura'],
    ['多良間村', 'たらまそん', 'Tarama-son'],
    ['観音寺市', 'かんおんじし', 'Kanonji-shi']
  ])('U12・D33：接尾辞をハイフンで分ける（%s・%s → %s）', (name, kana, expected) => {
    // Act
    const result = municipalityRomaji(name, kana);

    // Assert
    expect(result).toBe(expected);
  });
});
