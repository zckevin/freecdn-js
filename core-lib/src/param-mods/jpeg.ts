class ParamJpeg extends ParamBase {

  public static parseConf(conf: string) {
    const config = parseJson(conf)
    if (typeof config !== 'object') {
      return 'ParamJpeg: invalid config format'
    }
    const { usedBits, length } = config
    if (!usedBits || !length) {
      return 'ParamJpeg: usedBits & length are required'
    }
    if (typeof length !== 'number' || length < 0) {
      return 'ParamJpeg: length must be a positive number'
    }
    const args = usedBits.split("-");
    if (args.length !== 2) {
      return 'ParamJpeg: invalid usedBits format'
    }
    return [
      length,
      { from: parseInt(args[0]), to: parseInt(args[1])}
    ] 
  }

  private readonly queueArr: Uint8Array[] = []
  private queueLen = 0

  private port: any = null;
  private firedTasks: Map<string, any> = new Map();
  private cachedTasks: Array<any> = [];

  public constructor(private readonly length: any, private readonly usedBits: any) {
    super()

    self.addEventListener("message", (msg) => {
      console.log("sw recv:", msg);
      const { name } = msg.data;
      if (name !== "hostReady") {
        return;
      }

      this.port = msg.ports[0];
      this.port.onmessage = (msg: any) => {
        const { name, decoded, taskId } = msg.data;
        if (name !== "jpegDecoder" || !taskId) {
          return;
        }
        console.log(`jpegDecoded task finishes: ${taskId}`);
        const resolveFunc = this.firedTasks.get(taskId).resolve;
        this.firedTasks.delete(taskId);
        resolveFunc(decoded);
      }

      if (this.cachedTasks.length > 0) {
        this.cachedTasks.forEach(task => {
          this.port.postMessage(task, [task.file.buffer]);
        });
        this.cachedTasks = [];
      }
    });
  }

  public onData(chunk: Uint8Array) {
    this.queueLen += chunk.length
    if (this.queueLen > ParamStreamConf.MAX_QUEUE_LEN) {
      throw new ParamError('max queue length exceeded')
    }
    this.queueArr.push(chunk)
    return EMPTY_BUF
  }

  private async requestJpegDecoderInHost(taskId: string, file: Uint8Array, config: any) {
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

  public async onEnd(chunk: Uint8Array) {
    if (chunk.length > 0) {
      // unlikely
      this.onData(chunk)
    }
    const file = concatBufs(this.queueArr, this.queueLen)

    const config = {
      usedBits: this.usedBits,
      length: this.length,
    }
    const taskId = uuid();
    return this.requestJpegDecoderInHost(taskId, file, config);
  }
}