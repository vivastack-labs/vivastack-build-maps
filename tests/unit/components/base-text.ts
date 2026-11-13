/** 要素の文字列から、ふりがな（<rt>）を除いた本文を返す（`plainText()` の結果と比べるため） */
export function textWithoutRuby(element: Element): string {
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll('rt').forEach(rt => rt.remove());
  return copy.textContent ?? '';
}
