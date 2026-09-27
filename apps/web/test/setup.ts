import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

// jsdom lacks <dialog> modality and ResizeObserver in some versions.
const dialogProto = HTMLDialogElement.prototype as unknown as Partial<Record<'showModal' | 'close', (this: HTMLDialogElement) => void>>;
if (typeof dialogProto.showModal !== 'function') {
  dialogProto.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
}
if (typeof dialogProto.close !== 'function') {
  dialogProto.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
}
if (!('ResizeObserver' in globalThis)) {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    value: class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  });
}
