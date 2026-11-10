export interface TypescriptAssets {
  readonly typescriptExtractor: string;
  readonly pageTemplate: () => Promise<string>;
  readonly typescriptExtractorVersion: () => string;
}

export interface Assets extends TypescriptAssets {
  readonly goExtractor: string;
  readonly goExtractorVersion: (goVersion: string) => string;
  readonly goExtractorEnv: (goVersion: string) => Readonly<Record<string, string>>;
  readonly rubyExtractor: string;
  readonly rubyExtractorVersion: (rubyVersion: string) => string;
  readonly rubyExtractorEnv: () => Readonly<Record<string, string>>;
}

export { assets } from './clone-assets.ts';
