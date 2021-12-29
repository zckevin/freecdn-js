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
  ParamJpeg.onMessageHandler(msg);
});

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

  private static port: any = null;
  private static firedTasks: Map<string, TaskPromise> = new Map();
  private static cachedTasks: Array<WaitingTask> = [];

  private static takeTaskPromise(taskId: string): TaskPromise | null {
    const task = ParamJpeg.firedTasks.get(taskId);
    if (task) {
      ParamJpeg.firedTasks.delete(taskId);
      return task;
    } else {
      return null;
    }
  }

  public static onMessageHandler(msg: any) {
    console.log("sw recv:", msg);
    const { name } = msg.data;
    if (name !== "hostReady") {
      return;
    }
    ParamJpeg.port = msg.ports[0];
    ParamJpeg.port.onmessage = (msg: any) => {
      const { name, decoded, taskId } = msg.data;
      if (name !== "jpegDecoder" || !taskId) {
        return;
      }
      console.log(`jpegDecoded task finishes: ${taskId}`);
      const task = ParamJpeg.takeTaskPromise(taskId);
      // requests may already resolved by other urls
      if (!task) {
        return;
      }
      task.resolve(decoded);
    }

    if (ParamJpeg.cachedTasks.length > 0) {
      ParamJpeg.cachedTasks.forEach(task => {
        ParamJpeg.port.postMessage(task, [task.file.buffer]);
      });
      ParamJpeg.cachedTasks = [];
    }
  }

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

  private async requestJpegDecoderInHost(taskId: string, file: Uint8Array, config: JpegDecoderTaskConfig) {
    const task = { name: "jpegDecoder", file, config, taskId };
    if (ParamJpeg.port) {
      ParamJpeg.port.postMessage(task, [file.buffer]);
    } else {
      ParamJpeg.cachedTasks.push(task);
    }
    const promise: Promise<Uint8Array> = new Promise((resolve, reject) => {
      ParamJpeg.firedTasks.set(taskId, {
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