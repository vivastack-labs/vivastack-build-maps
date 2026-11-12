import { strToU8, zipSync } from 'fflate';
import { describe, expect, test } from 'vitest';
import { readSoumuCodes } from '../../../../../geo/scripts/lib/soumu';

// 総務省「全国地方公共団体コード」の xlsx を、テストの中で小さく組み立てる（8.1、D32）。
// 実物と同じく、文字列は共有文字列（t="s"）で、シート2の一部のコードは数値のセルで入っている
type Cell = string | { readonly number: string } | undefined;

const COLUMNS = ['A', 'B', 'C', 'D', 'E'] as const;
const HEADER: readonly Cell[] = ['団体コード', '都道府県名\n（漢字）', '市区町村名\n（漢字）', '都道府県名\n（カナ）', '市区町村名\n（カナ）'];

function buildXlsx(sheets: readonly (readonly (readonly Cell[])[])[], phonetics: Readonly<Record<string, string>> = {}): Uint8Array {
  const strings: string[] = [];
  const indexOf = (text: string): number => {
    const found = strings.indexOf(text);
    return found >= 0 ? found : strings.push(text) - 1;
  };
  const sheetXml = sheets.map(rows => {
    const body = [HEADER, ...rows]
      .map((row, r) => {
        const cells = row
          .map((cell, c) => {
            const ref = `${COLUMNS[c]}${r + 1}`;
            if (cell === undefined) return `<c r="${ref}" s="3"/>`;
            if (typeof cell === 'object') return `<c r="${ref}" s="15"><v>${cell.number}</v></c>`;
            return `<c r="${ref}" s="2" t="s"><v>${indexOf(cell)}</v></c>`;
          })
          .join('');
        return `<row r="${r + 1}" spans="1:5">${cells}</row>`;
      })
      .join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet><sheetData>${body}</sheetData></worksheet>`;
  });
  const sharedStrings = strings
    .map(text => {
      const phonetic = phonetics[text];
      const escaped = text.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
      return phonetic === undefined ? `<si><t>${escaped}</t></si>` : `<si><t>${escaped}</t><rPh sb="0" eb="3"><t>${phonetic}</t></rPh><phoneticPr fontId="1"/></si>`;
    })
    .join('');
  return zipSync({
    'xl/sharedStrings.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst count="${strings.length}">${sharedStrings}</sst>`),
    ...Object.fromEntries(sheetXml.map((xml, index) => [`xl/worksheets/sheet${index + 1}.xml`, strToU8(xml)]))
  });
}

const SHEET1: readonly (readonly Cell[])[] = [
  ['010006', '北海道', undefined, 'ﾎｯｶｲﾄﾞｳ', undefined],
  ['011002', '北海道', '札幌市', 'ﾎｯｶｲﾄﾞｳ', 'ｻｯﾎﾟﾛｼ'],
  ['016951', '北海道', '色丹村', 'ﾎｯｶｲﾄﾞｳ', 'ｼｺﾀﾝﾑﾗ'],
  ['131016', '東京都', '千代田区', 'ﾄｳｷｮｳﾄ', 'ﾁﾖﾀﾞｸ']
];
const SHEET2: readonly (readonly Cell[])[] = [
  ['011002', '北海道', '札幌市', 'ﾎｯｶｲﾄﾞｳ', 'ｻｯﾎﾟﾛｼ'],
  ['011011', '北海道', '札幌市中央区', 'ﾎｯｶｲﾄﾞｳ', 'ｻｯﾎﾟﾛｼﾁｭｳｵｳｸ'],
  [{ number: '431001' }, '熊本県', '熊本市', 'ｸﾏﾓﾄｹﾝ', 'ｸﾏﾓﾄｼ']
];

describe('readSoumuCodes', () => {
  test('D32：シート1・シート2の行から、5桁のコード・名前・カナを読む', () => {
    // Arrange
    const xlsx = buildXlsx([SHEET1, SHEET2]);

    // Act
    const codes = readSoumuCodes(xlsx);

    // Assert
    expect([...codes.keys()]).toEqual(['01100', '01695', '13101', '01101', '43100']);
    expect(codes.get('01101')).toEqual({ code: '01101', name: '札幌市中央区', kana: 'ｻｯﾎﾟﾛｼﾁｭｳｵｳｸ' });
    expect(codes.get('43100')).toEqual({ code: '43100', name: '熊本市', kana: 'ｸﾏﾓﾄｼ' });
  });

  test('D32：都道府県の行（市区町村名が空）と見出しの行は読まない', () => {
    // Arrange
    const xlsx = buildXlsx([SHEET1]);

    // Act
    const codes = readSoumuCodes(xlsx);

    // Assert
    expect(codes.has('01000')).toBe(false);
    expect(codes.size).toBe(3);
  });

  test('D32：名前のセルのふりがな（rPh）は名前に入れない（色丹村）', () => {
    // Arrange
    const xlsx = buildXlsx([SHEET1], { 色丹村: 'シコタンムラ' });

    // Act
    const codes = readSoumuCodes(xlsx);

    // Assert
    expect(codes.get('01695')?.name).toBe('色丹村');
  });

  test('D32：XML の文字参照を元の字に戻す', () => {
    // Arrange
    const xlsx = buildXlsx([[['131016', '東京都', 'A&B区', 'ﾄｳｷｮｳﾄ', 'ｴｰｸ']]]);

    // Act
    const codes = readSoumuCodes(xlsx);

    // Assert
    expect(codes.get('13101')?.name).toBe('A&B区');
  });

  test('D32：10進・16進の文字参照と、知らない実体参照（そのまま残す）を読む', () => {
    // Arrange
    const xlsx = buildXlsx([[['131016', '東京都', '&#21315;&#x4EE3;田&foo;区', 'ﾄｳｷｮｳﾄ', 'ﾁﾖﾀﾞｸ']]]);

    // Act
    const codes = readSoumuCodes(xlsx);

    // Assert（buildXlsx は & を &amp; にするので、&amp;#21315; が &#21315; に戻る）
    expect(codes.get('13101')?.name).toBe('&#21315;&#x4EE3;田&foo;区');
  });

  test('D32：共有文字列の中の文字参照を元の字に戻す', () => {
    // Arrange
    const sheet = '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c><c r="E1" t="s"><v>2</v></c></row></sheetData></worksheet>';
    const strings = '<sst><si><t>131016</t></si><si><t>&#21315;&#x4EE3;田&foo;区</t></si><si><t>ﾁﾖﾀﾞｸ</t></si></sst>';
    const xlsx = zipSync({ 'xl/sharedStrings.xml': strToU8(strings), 'xl/worksheets/sheet1.xml': strToU8(sheet) });

    // Act
    const codes = readSoumuCodes(xlsx);

    // Assert
    expect(codes.get('13101')?.name).toBe('千代田&foo;区');
  });

  test('共有文字列の番号が範囲の外ならエラーにする', () => {
    // Arrange
    const sheet = '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>9</v></c></row></sheetData></worksheet>';
    const xlsx = zipSync({ 'xl/sharedStrings.xml': strToU8('<sst><si><t>a</t></si></sst>'), 'xl/worksheets/sheet1.xml': strToU8(sheet) });

    // Act / Assert
    expect(() => readSoumuCodes(xlsx)).toThrow('範囲の外');
  });

  test.each(['011003', '01100', '0110021'])('検査数字付きの6桁でないコード（%s）はエラーにする', code => {
    // Arrange
    const xlsx = buildXlsx([[[code, '北海道', '札幌市', 'ﾎｯｶｲﾄﾞｳ', 'ｻｯﾎﾟﾛｼ']]]);

    // Act / Assert
    expect(() => readSoumuCodes(xlsx)).toThrow(code);
  });

  test('市区町村名があってカナが空の行はエラーにする', () => {
    // Arrange
    const xlsx = buildXlsx([[['011002', '北海道', '札幌市', 'ﾎｯｶｲﾄﾞｳ', undefined]]]);

    // Act / Assert
    expect(() => readSoumuCodes(xlsx)).toThrow('011002');
  });

  test('同じコードが別の名前・カナで2回出てきたらエラーにする', () => {
    // Arrange
    const xlsx = buildXlsx([SHEET1, [['011002', '北海道', '札幌市', 'ﾎｯｶｲﾄﾞｳ', 'ｻｯﾎﾛｼ']]]);

    // Act / Assert
    expect(() => readSoumuCodes(xlsx)).toThrow('01100');
  });

  test('共有文字列やシートがない xlsx はエラーにする', () => {
    // Arrange
    const xlsx = zipSync({ 'xl/workbook.xml': strToU8('<workbook/>') });

    // Act / Assert
    expect(() => readSoumuCodes(xlsx)).toThrow('xlsx');
  });
});
