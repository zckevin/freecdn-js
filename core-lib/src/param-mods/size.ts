class ParamSize extends ParamBase {

  public static parseConf(conf: string) {
    const size = parseByteUnit(conf)
    if (isNaN(size)) {
      return 'invalid byte format'
    }
    return [size]
  }


  private remain: number
  private done = false

  public constructor(
    private readonly size: number
  ) {
    super()
    this.remain = size
  }

  public onData(chunk: Uint8Array) {
    if (this.done) {
      return EMPTY_BUF
    }
    const remain = (this.remain -= chunk.length)
    if (remain > 0) {
      return chunk
    }
    this.done = true

    if (remain === 0) {
      return chunk
    }
    // remain < 0, return [0, END + remain)
    return chunk.subarray(0, remain)
  }

  public onEnd(chunk: Uint8Array) {
    return this.onData(chunk)
  }
}
