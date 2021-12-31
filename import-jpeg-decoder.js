const fs = require('fs')
const crypto = require('crypto')

function getFileHash(file) {
  const data = fs.readFileSync(file)
  const buf = crypto.createHash('sha256').update(data).digest()
  return buf.toString('base64')
}

function fillVersionAndHash(config) {
  config.ver = require(require.resolve(`${config.package}/package.json`)).version 
  config.hash = getFileHash(require.resolve(`${config.package}${config.filePath}`))
}

function getCDNUrls(config) {
  const CDNlist = [
    "npm.elemecdn.com",
    "cdn.jsdelivr.net/npm",
    "unpkg.zhimg.com",
    "unpkg.com",
  ]
  const { package, filePath, ver } = config
  return CDNlist.map(host => {
    let s = `https://${host}/${package}`
    if (ver)  {
      s += `@${ver}`
    }
    if (filePath) {
      s += `${filePath}`
    }
    return s
  }).join("\n")
}

function getWasmDecoderManifest() {
  const config = {
    wasm: {
      package: "nanojpeg-wasm",
      filePath: "/nanojpeg.wasm",
      ver: "",
      hash: "",
    },
    js: {
      package: "@zckevin/jpeg-channel-wasm",
      filePath: "/dist/jpeg-decoder.min.js",
      ver: "",
      hash: "",
    }
  }

  fillVersionAndHash(config.wasm)
  fillVersionAndHash(config.js)

  const manifest = `
${config.wasm.filePath}
  ${getCDNUrls(config.wasm)}
  hash=${config.wasm.hash}
  open_timeout=0

${config.js.filePath}
  ${getCDNUrls(config.js)}
  hash=${config.js.hash}
  open_timeout=0
`
  return manifest;
}

module.exports = {
  getWasmDecoderManifest,
}