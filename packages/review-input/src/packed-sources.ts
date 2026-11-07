export type SourceTexts = Readonly<Record<string, string>>;

export interface Sources {
  readonly branch: SourceTexts;
  readonly base: SourceTexts;
}

const BYTES_PER_CHARACTER_RUN = 0x8000;

const bytesThrough = async (
  bytes: Uint8Array<ArrayBuffer>,
  transform: CompressionStream | DecompressionStream,
): Promise<Uint8Array<ArrayBuffer>> => {
  const writer = transform.writable.getWriter();
  void writer.write(bytes);
  void writer.close();
  const reader = transform.readable.getReader();
  const chunks: Uint8Array[] = [];
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read())
    chunks.push(chunk.value);
  const joined = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
  chunks.reduce((offset, chunk) => {
    joined.set(chunk, offset);
    return offset + chunk.length;
  }, 0);
  return joined;
};

const base64Of = (bytes: Uint8Array): string => {
  let binary = '';
  for (let start = 0; start < bytes.length; start += BYTES_PER_CHARACTER_RUN)
    binary += String.fromCharCode(...bytes.subarray(start, start + BYTES_PER_CHARACTER_RUN));
  return btoa(binary);
};

const bytesOf = (base64: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));

export const packedSourcesOf = async (sources: Sources): Promise<string> =>
  base64Of(
    await bytesThrough(
      new TextEncoder().encode(JSON.stringify(sources)),
      new CompressionStream('gzip'),
    ),
  );

const isSourceTexts = (value: unknown): value is object =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const unpackedSourcesOf = async (packed: string): Promise<Sources> => {
  const parsed: unknown = JSON.parse(
    new TextDecoder().decode(await bytesThrough(bytesOf(packed), new DecompressionStream('gzip'))),
  );
  for (const side of ['branch', 'base'])
    if (!isSourceTexts(parsed) || !isSourceTexts(Reflect.get(parsed, side)))
      throw new Error(
        `The packed sources are malformed: "${side}" is not an object of source texts.`,
      );
  return parsed as Sources;
};
