type JpegDecoderTaskConfig = {
  length: number,
  usedBits: {
    from: number,
    to: number,
  },
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

    const config = {
      usedBits: this.usedBits,
      length: this.length,
    }
    return JpegChannelWasmDecoder.decode(file, config);
  }
}