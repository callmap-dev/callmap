export interface Assets {
  readonly typescriptExtractor: string;
  readonly pageTemplate: () => Promise<string>;
  readonly typescriptExtractorVersion: () => string;
}

export { assets } from './clone-assets.ts';
