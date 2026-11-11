// 10.2：コンポーネントテスト（jsdom）の共通の準備
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

// globals を使わないので、Testing Library の自動の準備（act の環境の設定と片付け）が動かない。ここで代わりに行う
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
});
