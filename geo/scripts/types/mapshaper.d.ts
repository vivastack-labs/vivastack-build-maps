// mapshaper には型がないので、使う API（applyCommands）だけを書く（T1-04）
declare module 'mapshaper' {
  /** 出力のファイル名 → 中身 */
  type Outputs = Record<string, Uint8Array | string>;

  const mapshaper: {
    /** コマンドの文字列（CLI と同じ書き方）を実行し、出力をファイルに書かずに返す。input は `-i` で指定するファイル名 → 中身 */
    applyCommands(commands: string, input?: Record<string, unknown>): Promise<Outputs>;
  };
  export default mapshaper;
}
