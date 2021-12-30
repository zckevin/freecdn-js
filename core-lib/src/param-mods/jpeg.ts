type ResolveFunc = (decoded: Uint8Array) => any;
type TaskPromise = { resolve: ResolveFunc, reject: any };
type JpegDecoderTaskConfig = {
  length: number,
  usedBits: {
    from: number,
    to: number,
  },
}
type WaitingTask = {
  name: string,
  taskId: string,
  file: Uint8Array,
  config: JpegDecoderTaskConfig,
}

self.addEventListener("message", (msg) => {
  BrowserDecoder.onMessageHandler(msg);
});

class BrowserDecoder {
  private static port: any = null;
  private static firedTasks: Map<string, TaskPromise> = new Map();
  private static cachedTasks: Array<WaitingTask> = [];

  private static takeTaskPromise(taskId: string): TaskPromise | null {
    const task = this.firedTasks.get(taskId);
    if (task) {
      this.firedTasks.delete(taskId);
      return task;
    } else {
      return null;
    }
  }

  public static onMessageHandler(msg: any) {
    const { name } = msg.data;
    if (name !== "windowClientReady") {
      return;
    }
    this.port = msg.ports[0];
    this.port.onmessage = (msg: any) => {
      const { name, decoded, taskId } = msg.data;
      if (name !== "jpegDecoder" || !taskId) {
        return;
      }
      console.log(`jpegDecoded task finishes: ${taskId}`);
      const task = this.takeTaskPromise(taskId);
      // requests may already resolved by other urls
      if (!task) {
        return;
      }
      task.resolve(decoded);
    }

    if (this.cachedTasks.length > 0) {
      this.cachedTasks.forEach(task => {
        this.port.postMessage(task, [task.file.buffer]);
      });
      this.cachedTasks = [];
    }
  }

  public static async requestJpegDecoderInWindowClient(taskId: string, file: Uint8Array, config: JpegDecoderTaskConfig) {
    const task = { name: "jpegDecoder", file, config, taskId };
    if (this.port) {
      this.port.postMessage(task, [file.buffer]);
    } else {
      this.cachedTasks.push(task);
    }
    const promise: Promise<Uint8Array> = new Promise((resolve, reject) => {
      this.firedTasks.set(taskId, {
        resolve,
        reject,
      })
    });
    return promise;
  }
}

class ModuleLoader {
  private static hasErr = false
  public static signal: PromiseX | undefined
  public static module = {
    JpegDecoder: null,
    UsedBits: null,
    WasmDecoder: null,
    loadWasm: null,
  }

  public static async init() {
    if (this.signal) {
      return
    }
    this.signal = promisex()

    const JPEG_WASM_PATH = "/nanojpeg.wasm"
    const JPEG_GLUE_PATH = "/index.js"

    const JPEG_MANIFEST = `
${JPEG_WASM_PATH}
  https://npm.elemecdn.com/nanojpeg-wasm/nanojpeg.wasm

${JPEG_GLUE_PATH}
  http://localhost:9006/jpeg-decoder.js
`
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
      const js = await cdn.fetchText(JPEG_GLUE_PATH)
      const func = Function("arg", `${js}\n return jpeg_decoder;`)
      // @ts-ignore
      this.module = func();
      // @ts-ignore
      await this.module.loadWasm(onFetch);
      this.signal?.resolve()
    } catch (err) {
      console.warn('[FreeCDN/jpeg-wasm] failed to execute module', err)
      onError()
      return
    }
  }
}

class WasmDecoder {
  public static async decode(file: Uint8Array, config: JpegDecoderTaskConfig) {
    ModuleLoader.init()
    await ModuleLoader.signal

    const { JpegDecoder, UsedBits, WasmDecoder } = ModuleLoader.module;
    // @ts-ignore
    const usedBits = new UsedBits(config.usedBits.from, config.usedBits.to);
    // @ts-ignore
    const decoder = new JpegDecoder(usedBits, WasmDecoder);
    return new Uint8Array(await decoder.Read(file, config.length));
  }
}

class ParamJpeg extends ParamBase {

  /**
   * conf format: jpeg=${length}_${usedBits.from}_${usedBits.to}
   * @param conf 
   * @returns 
   */
  public static parseConf(conf: string) {
    const args = conf.split("_");
    if (args.length !== 3) {
      return 'ParamJpeg: invalid conf format'
    }
    return [
      parseInt(args[0]),
      { from: parseInt(args[1]), to: parseInt(args[2])}
    ]
  }

  private readonly queueArr: Uint8Array[] = []
  private queueLen = 0

  public constructor(private readonly length: any, private readonly usedBits: any) {
    super()
  }

  public onData(chunk: Uint8Array) {
    this.queueLen += chunk.length
    if (this.queueLen > ParamStreamConf.MAX_QUEUE_LEN) {
      throw new ParamError('max queue length exceeded')
    }
    this.queueArr.push(chunk)
    return EMPTY_BUF
  }

  public async onEnd(chunk: Uint8Array) {
    if (chunk.length > 0) {
      // unlikely
      this.onData(chunk)
    }
    const file = concatBufs(this.queueArr, this.queueLen)

    const taskId = uuid();
    const config = {
      usedBits: this.usedBits,
      length: this.length,
    }
    // return BrowserDecoder.requestJpegDecoderInWindowClient(taskId, file, config);
    return WasmDecoder.decode(file, config);
  }
}