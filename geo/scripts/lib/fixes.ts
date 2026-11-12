// 読み・ローマ字の修正表（geo/sources/*.csv）を読む（T1-04、7.4.1、D33）。
// 総務省のカナから機械的に作ると間違うもの（大きい字の拗音、語の境目の長音）を、団体コードで引いて直す。
// 「直す前」（before）の値を持ち、変換のときに今の結果と比べる。年1回の更新でカナが変わったとき、
// 古い修正が黙って当たり続けないようにするため。

export type Fix = {
  readonly code: string;
  /** 人が読むための名前（照合には使わない） */
  readonly name: string;
  readonly before: string;
  readonly after: string;
};

/** 団体コード（5桁）→ 修正 */
export type FixTable = ReadonlyMap<string, Fix>;

const CODE = /^\d{5}$/;
const COLUMN_COUNT = 4;

/**
 * 修正表の CSV（見出しは `code,name,before,<afterColumn>`）を読む。値にカンマ・引用符は使わない。
 * 見出し・列の数・コードの形・重複・空の値・直す前と後が同じ、のどれかがおかしければエラー。
 */
export function parseFixTable(csv: string, afterColumn: string): FixTable {
  const [header, ...lines] = csv.split(/\r?\n/);
  const expectedHeader = `code,name,before,${afterColumn}`;
  if (header !== expectedHeader) {
    throw new Error(`修正表の見出しが「${expectedHeader}」ではありません（${header ?? ''}）`);
  }
  const fixes = lines.filter(line => line !== '').map(toFix);
  const table = new Map(fixes.map(fix => [fix.code, fix] as const));
  if (table.size !== fixes.length) {
    const duplicated = fixes.find((fix, index) => fixes.findIndex(other => other.code === fix.code) !== index);
    throw new Error(`修正表のコードが重複しています（${duplicated?.code ?? ''}）`);
  }
  return table;
}

function toFix(line: string): Fix {
  const values = line.split(',');
  const [code = '', name = '', before = '', after = ''] = values;
  if (values.length !== COLUMN_COUNT || values.some(value => value === '')) {
    throw new Error(`修正表の行の列が${COLUMN_COUNT}つそろっていません（${line}）`);
  }
  if (!CODE.test(code)) {
    throw new Error(`修正表のコードが5桁ではありません（${line}）`);
  }
  if (before === after) {
    throw new Error(`修正表の直す前と後が同じです（${line}）`);
  }
  return { code, name, before, after };
}
