// 10.2：コンポーネントテスト（jsdom）の共通の準備
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// globals を使わないので、Testing Library は描画したものを自動で片付けない。テストごとに片付ける
afterEach(() => {
  cleanup();
});
