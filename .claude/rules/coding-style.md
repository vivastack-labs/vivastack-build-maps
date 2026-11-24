# Coding Style

## Immutability (CRITICAL)

ALWAYS create new objects, NEVER mutate existing ones:

```
// Pseudocode
WRONG:  modify(original, field, value) → changes original in-place
CORRECT: update(original, field, value) → returns new copy with change
```

## File Organization

MANY SMALL FILES > FEW LARGE FILES:
- High cohesion, low coupling
- 200-400 lines typical, 800 max
- Extract utilities from large modules
- Organize by feature/domain, not by type

## JSDoc

- export する関数・クラス・型・定数には、JSDoc（`/** */`）を付ける。`//` の行コメントはエディタのホバーに出ないので、代わりにならない。
  - 何をするか・何を表すかを書く。前提（境界で確かめてから渡す、など）、エラーにする条件、要件ID・設計書の章があれば書く。
  - 型と名前で分かることだけを繰り返さない（`@param` `@returns` は、型と名前で足りなければ書く）。
- ファイルの中だけで使う関数は、名前で分からないときだけ付ける。
- `src/`・`scripts/`・`geo/scripts/` は ESLint（`jsdoc/require-jsdoc`）で確かめる。`app/` は Next.js が決めた名前の export なので対象にしない。自動生成のファイル（`*.generated.ts`）も対象にしない。
