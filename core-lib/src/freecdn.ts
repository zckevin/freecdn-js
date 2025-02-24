///<reference path="global.ts"/>
///<reference path="param-base.ts"/>
///<reference path="key-manager.ts"/>
///<reference path="manifest.ts"/>
///<reference path="url-conf.ts"/>
///<reference path="url-loader.ts"/>
///<reference path="file-conf.ts"/>
///<reference path="file-loader.ts"/>
///<reference path="updater.ts"/>


class FreeCDN {
  private static globalInited: boolean | PromiseX

  private static async globalInit() {
    if (this.globalInited) {
      return this.globalInited
    }
    this.globalInited = promisex()

    await CacheManager.init()
    await Network.init()
    UrlConf.init()

    this.globalInited.resolve()
    this.globalInited = true
  }


  public enableCacheStorage = true
  public manifest: Manifest | undefined

  private readonly updater: Updater | undefined
  private inited = false


  public constructor(manifestUrl?: string) {
    if (manifestUrl) {
      this.updater = new Updater(this, manifestUrl)
    }
  }

  public async fetch(input: RequestInfo, init?: RequestInit) {
    const req = (input instanceof Request && !init)
      ? input
      : new Request(input, init)

    if (!/^https?:/.test(req.url)) {
      return NATIVE_FETCH(req)
    }

    const {manifest} = this
    if (!manifest) {
      return Network.fetch(req)
    }
    const dest = this.tryFile(manifest, req)
    if (!dest) {
      return Network.fetch(req)
    }
    if (dest instanceof Response) {
      return dest
    }

    let fileName: string
    let suffix = ''

    if (dest instanceof Array) {
      [fileName, suffix] = dest
    } else {
      fileName = dest
    }

    const fileConf = manifest.get(fileName) as FileConf
    fileConf.parse()

    let fileHash = ''

    const hashParam = fileConf.params.get('hash')
    if (hashParam && hashParam.length === LEN.SHA256_B64) {
      fileHash = hashParam
    }

    const cacheable = this.enableCacheStorage && fileHash
    if (cacheable) {
      const res = await CacheManager.findHash(fileHash)
      if (res) {
        return res
      }
    }

    const fileLoader = new FileLoader(fileConf, req, manifest, suffix)
    const promise = promisex<Response>()

    // 1-hash file, no stream
    if (fileHash) {
      fileLoader.onOpen = (args) => {
        fileLoader.onData = (body) => {
          const res = new Response(body, args)
          if (cacheable && body.length < 1024 * 1024 * 5) {
            const cacheRes = res.clone()
            cacheRes.headers.set('content-length', body.length + '')
            cacheRes.headers.set('x-raw-url', req.url)
            CacheManager.addHash(fileHash, cacheRes)
          }
          promise.resolve(res)
        }
      }
      fileLoader.onError = (err) => {
        console.warn('[FreeCDN]', err.message, err.urlErrs)
        promise.reject(err)
      }
      fileLoader.onEnd = () => {
      }
      fileLoader.open()
      return promise
    }

    // multi-hash or no-hash
    let controller: ReadableStreamDefaultController
    let paused = false

    const checkPressure = () => {
      const {desiredSize} = controller
      if (desiredSize === null) {
        return
      }
      if (desiredSize <= 0) {
        if (!paused) {
          fileLoader.pause()
          paused = true
        }
      } else {
        if (paused) {
          fileLoader.resume()
          paused = false
        }
      }
    }

    const stream = new ReadableStream({
      start(c: typeof controller) {
        controller = c
      },
      pull() {
        checkPressure()
      },
      cancel(reason: any) {
        console.warn('[FreeCDN] stream cancel:', reason)
        fileLoader.abort(reason)
      },
    })

    fileLoader.onData = (chunk) => {
      controller.enqueue(chunk)
      checkPressure()
    }
    fileLoader.onEnd = () => {
      controller.close()
    }
    fileLoader.onError = (err) => {
      controller.error()
      console.warn('[FreeCDN]', err.message, err.urlErrs)
      promise.reject(err)
    }
    fileLoader.onOpen = (args) => {
      const res = new Response(stream, args)
      promise.resolve(res)
    }
    fileLoader.open()
    return promise
  }

  public async fetchText(url: string) {
    const res = await this.fetch(url)
    return res.text()
  }

  public async fetchBin(url: string) {
    const res = await this.fetch(url)
    const buf = await res.arrayBuffer()
    return new Uint8Array(buf)
  }

  public async fetchBlob(url: string) {
    const res = await this.fetch(url)
    const buf = await res.arrayBuffer()
    const type = res.headers.get('content-type') || ''
    return new Blob([buf], {type})
  }

  public async update() {
    if (this.updater) {
      return this.updater.update()
    }
    return false
  }

  public async setPublicKey(keyB64: string) {
    if (keyB64.length !== LEN.PUBKEY_B64) {
      keyB64 = `MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE${keyB64}==`
    }
    await KeyManager.set(keyB64)
  }

  public set preservePerformanceEntries(status: boolean) {
    Network.preservePerformanceEntries(status)
  }

  public async init() {
    console.assert(!this.inited)
    this.inited = true

    await FreeCDN.globalInit()

    if (this.updater) {
      await this.updater.init()
    }
  }

  private tryFile(manifest: Manifest, req: Request) {
    const url = new URL(req.url)
    const origin = url.host === MY_HOST ? '' : url.origin

    // merge slashes
    const path = url.pathname.replace(/\/{2,}/g, '/')
    const file = origin + path

    // image upgrade
    if (REG_IMG_EXTS.test(file) && req.mode !== 'cors' && !req.integrity) {
      const accept = req.headers.get('accept') || ''
      if (accept.includes('image/avif')) {
        if (manifest.has(file + '.avif')) {
          return file + '.avif'
        }
      }
      if (accept.includes('image/webp')) {
        if (manifest.has(file + '.webp')) {
          return file + '.webp'
        }
      }
    }

    if (manifest.has(file)) {
      return file
    }
    if (file.endsWith('/') && manifest.has(file + 'index.html')) {
      return file + 'index.html'
    }
    if (manifest.has(file + '/index.html')) {
      return Response.redirect(file + '/')
    }

    // directory match
    let dir = path.replace(/[^/]*$/, '')
    for (;;) {
      if (manifest.has(origin + dir)) {
        const suffix = path.substr(dir.length) + url.search
        return [origin + dir, suffix]
      }
      if (dir === '/') {
        break
      }
      dir = dir.replace(/[^/]+\/$/, '')
    }
  }
}