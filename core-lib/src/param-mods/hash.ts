const enum ParamHashConf {
  MAX_QUEUE_LEN = 64 * 1024 * 1024
}

class ParamHash extends ParamBase {

  public static parseConf(conf: string) {
    // conf format:
    // [blksize;]hash1,hash2,...
    let blkLen = Infinity
    let hashes = conf

    const pos = conf.indexOf(';')
    if (pos > 0) {
      const blkLenStr = conf.substr(0, pos)
      hashes = conf.substr(pos + 1)
      blkLen = parseByteUnit(blkLenStr)
      if (isNaN(blkLen)) {
        return 'invalid block length'
      }
    }
    const hashBins: Uint8Array[] = []
    const hashHexs = hashes.split(',')

    for (let i = hashHexs.length - 1; i !== -1; i--) {
      const bin = base64Decode(hashHexs[i])
      if (!bin || bin.length !== LEN.SHA256_BIN) {
        return 'invalid block hash'
      }
      // reversed
      hashBins.push(bin)
    }
    return [blkLen, hashBins]
  }


  private readonly queueArr: Uint8Array[] = []
  private queueLen = 0
  private hasData = false

  public constructor(
    private readonly blkLen: number,
    private readonly hashArr: Uint8Array[]
  ) {
    super()
  }

  public async onData(chunk: Uint8Array) {
    this.hasData = true
    this.queueLen += chunk.length

    if (this.queueLen > ParamHashConf.MAX_QUEUE_LEN) {
      throw new ParamError('max queue length exceeded')
    }

    if (this.queueLen >= this.blkLen) {
      // let queueLen be integer multiple of blkLen
      const remain = this.queueLen % this.blkLen
      if (remain) {
        const head = chunk.subarray(0, -remain)
        this.queueArr.push(head)
        this.queueLen -= remain
      } else {
        this.queueArr.push(chunk)
      }
      const blks = await this.pull()
      this.queueLen = remain

      if (remain) {
        const tail = chunk.subarray(-remain)
        this.queueArr.push(tail)
      }
      return blks
    }

    this.queueArr.push(chunk)
    return EMPTY_BUF
  }

  public async onEnd(chunk: Uint8Array) {
    if (chunk.length > 0) {
      this.queueLen += chunk.length
      this.queueArr.push(chunk)
    }
    if (this.queueLen === 0) {
      if (!this.hasData) {
        await this.verify(EMPTY_BUF)
      }
      return EMPTY_BUF
    }
    return this.pull()
  }

  private async pull() {
    const blks = concatBufs(this.queueArr, this.queueLen)
    this.queueArr.length = 0

    for (let p = 0; p < blks.length; p += this.blkLen) {
      const blk = blks.subarray(p, p + this.blkLen)
      await this.verify(blk)
    }
    return blks
  }

  private async verify(blk: Uint8Array) {
    const hashExp = this.hashArr.pop()
    if (!hashExp) {
      throw new ParamError('missing hash')
    }
    const hashGot = await sha256(blk)
    if (!isArrayEqual(hashExp, hashGot)) {
      const exp = base64Encode(hashExp)
      const got = base64Encode(hashGot)
      throw new ParamError('hash incorrect. expected: ' + exp + ', but got: ' + got)
    }
  }
}
