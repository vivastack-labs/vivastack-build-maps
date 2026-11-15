import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';

// T4-02、5.4：Service Worker の登録。Next.js の JS のチャンク（外部ファイル）から行い、インラインスクリプトを増やさない（5.5）
describe('ServiceWorkerRegistration', () => {
  const register = vi.fn<(url: string, options?: RegistrationOptions) => Promise<unknown>>();

  const setReadyState = (state: DocumentReadyState): void => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue(state);
  };

  beforeEach(() => {
    register.mockReset();
    register.mockResolvedValue({});
    Object.defineProperty(navigator, 'serviceWorker', { value: { register }, configurable: true });
    setReadyState('complete');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  test('5.4：本番のビルドでは /sw.js を scope / で登録する', () => {
    // Arrange
    vi.stubEnv('NODE_ENV', 'production');

    // Act
    render(<ServiceWorkerRegistration />);

    // Assert
    expect(register).toHaveBeenCalledExactlyOnceWith('/sw.js', { scope: '/' });
  });

  test('5.4：DOM を出さない', () => {
    vi.stubEnv('NODE_ENV', 'production');

    const { container } = render(<ServiceWorkerRegistration />);

    expect(container).toBeEmptyDOMElement();
  });

  test('5.4：開発（pnpm dev。sw.js がない）では登録しない', () => {
    vi.stubEnv('NODE_ENV', 'development');

    render(<ServiceWorkerRegistration />);

    expect(register).not.toHaveBeenCalled();
  });

  test('5.4：Service Worker がないブラウザでは何もしない（例外にしない）', () => {
    // Arrange
    vi.stubEnv('NODE_ENV', 'production');
    Reflect.deleteProperty(navigator, 'serviceWorker');

    // Act・Assert
    expect(() => render(<ServiceWorkerRegistration />)).not.toThrow();
  });

  test('5.4：登録に失敗しても、例外にしない（画面には出さない）', async () => {
    // Arrange
    vi.stubEnv('NODE_ENV', 'production');
    register.mockRejectedValue(new Error('SecurityError'));
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);

    // Act
    render(<ServiceWorkerRegistration />);
    await new Promise(resolve => setTimeout(resolve, 0));

    // Assert
    process.off('unhandledRejection', unhandled);
    expect(register).toHaveBeenCalledTimes(1);
    expect(unhandled).not.toHaveBeenCalled();
  });

  test('5.4：読み込みの途中なら、load の後に登録する（ページの読み込みと通信を取り合わない）', () => {
    // Arrange
    vi.stubEnv('NODE_ENV', 'production');
    setReadyState('loading');

    // Act
    render(<ServiceWorkerRegistration />);
    expect(register).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('load'));

    // Assert
    expect(register).toHaveBeenCalledExactlyOnceWith('/sw.js', { scope: '/' });
  });

  test('5.4：load の前にアンマウントしたら、登録しない', () => {
    // Arrange
    vi.stubEnv('NODE_ENV', 'production');
    setReadyState('loading');

    // Act
    const { unmount } = render(<ServiceWorkerRegistration />);
    unmount();
    window.dispatchEvent(new Event('load'));

    // Assert
    expect(register).not.toHaveBeenCalled();
  });
});
