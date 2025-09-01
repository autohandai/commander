import '@testing-library/jest-dom';

// Basic polyfill for matchMedia used in theme resolution
if (typeof window !== 'undefined' && !window.matchMedia) {
  // @ts-expect-error augmenting window for tests
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

