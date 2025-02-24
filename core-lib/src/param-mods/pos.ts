class ParamPos extends ParamBase {

  public static parseConf(conf: string) {
    const begin = parseByteUnit(conf)
    if (isNaN(begin)) {
      return 'invalid byte format'
    }
    if (begin === 0) {
      return
    }
    return [begin]
  }


  private remain: number
  private done = false


  public constructor(begin: number) {
    super()
    this.remain = begin
  }

  public onData(chunk: Uint8Array) {
    if (this.done) {
      return chunk
    }
    const remain = (this.remain -= chunk.length)
    if (remain > 0) {
      return EMPTY_BUF
    }
    this.done = true

    if (remain === 0) {
      return EMPTY_BUF
    }
    // if remain < 0, return last -remain bytes
    return chunk.subarray(remain)
  }

  public onEnd(chunk: Uint8Array) {
    return this.onData(chunk)
  }
}