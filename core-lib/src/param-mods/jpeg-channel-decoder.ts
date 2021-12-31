interface UsedBitsType {
  new(from: number, to: number): UsedBitsType;
}

interface DecoderType {}

interface JpegDecoderType {
  new(usedBits: UsedBitsType, decoder: DecoderType): JpegDecoderType;
  Read(file: Uint8Array, length: number): Promise<ArrayBuffer>;
}

type JpegChannelWasmDecoderModule = {
  JpegDecoder: JpegDecoderType,
  UsedBits: UsedBitsType,
  WasmDecoder: DecoderType,
  loadWasm: (fn: (...args: any) => Promise<Response>) => Promise<void>,
}

class ModuleLoader {
  private static hasErr = false
  public static signal: PromiseX | undefined
  public static module: JpegChannelWasmDecoderModule

  public static async init() {
    if (this.signal) {
      return
    }
    this.signal = promisex()

    const JPEG_MANIFEST = `WASM_DECODER_MANIFEST`
    const onError = () => {
      this.hasErr = true
      this.signal?.resolve()
    }

    const manifest = new Manifest()
    await manifest.parse(JPEG_MANIFEST)

    const cdn = new FreeCDN()
    cdn.manifest = manifest

    const onFetch: typeof cdn.fetch = async (...args) => {
      try {
        return await cdn.fetch(...args)
      } catch (err) {
        console.warn('[FreeCDN/jpeg-wasm] failed to load module')
        onError()
        throw err
      }
    }

    try {
      // FIXME
      const js = await cdn.fetchText("/dist/jpeg-decoder.min.js")
      const func = Function("arg", `${js}\n return jpeg_decoder;`)
      // @ts-ignore
      this.module = func();
      await this.module.loadWasm(onFetch);
      this.signal?.resolve()
    } catch (err) {
      console.warn('[FreeCDN/jpeg-wasm] failed to execute module', err)
      onError()
      return
    }
  }
}

class JpegChannelWasmDecoder {
  public static async decode(file: Uint8Array, config: JpegDecoderTaskConfig) {
    ModuleLoader.init()
    await ModuleLoader.signal

    const { JpegDecoder, UsedBits, WasmDecoder } = ModuleLoader.module;
    const usedBits = new UsedBits(config.usedBits.from, config.usedBits.to);
    const decoder = new JpegDecoder(usedBits, WasmDecoder);
    return new Uint8Array(await decoder.Read(file, config.length));
  }
}