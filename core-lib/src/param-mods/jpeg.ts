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

  private port: any = null;
  private firedTasks: Map<string, TaskPromise> = new Map();
  private cachedTasks: Array<WaitingTask> = [];

  private takeTaskPromise(taskId: string): TaskPromise | null {
    const task = this.firedTasks.get(taskId);
    if (task) {
      this.firedTasks.delete(taskId);
      return task;
    } else {
      return null;
    }
  }

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