const fs = require('fs')
const path = require("path")
const crypto = require('crypto')
const PACKAGE_NAME = require("./package.json").name;

function getFileHash(file) {
  const data = fs.readFileSync(file)
  const buf = crypto.createHash('sha256').update(data).digest()
  return buf.toString('base64')
}

function fillVersionAndHash(config) {
  if (config.package === PACKAGE_NAME) {
    config.ver = require("./package.json").version 
    config.hash = getFileHash(path.join(__dirname, config.filePath))
  } else {
    config.ver = require(require.resolve(`${config.package}/package.json`)).version 
    config.hash = getFileHash(require.resolve(`${config.package}${config.filePath}`))
  }
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
  })
}

function getManifestByConfig(config) {
  fillVersionAndHash(config.wasm)
  fillVersionAndHash(config.js)

  const manifest = `
${config.wasm.filePath}
${getCDNUrls(config.wasm).map(_ => `  ${_}`).join("\n")}
  hash=${config.wasm.hash}
  open_timeout=0

${config.js.filePath}
${getCDNUrls(config.js).map(_ => `  ${_}`).join("\n")}
  hash=${config.js.hash}
  open_timeout=0
`
  console.log(manifest)
  return manifest;
}

function getJpegWasmDecoderManifest() {
  const config = {
    wasm: {
      package: "nanojpeg-wasm",
      filePath: "/nanojpeg.wasm",
    },
    js: {
      package: "@zckevin/jpeg-channel-wasm",
      filePath: "/dist/jpeg-decoder.min.js",
    }
  }
  return getManifestByConfig(config)
}

function getBrWasmDecoderManifest() {
  const config = {
    wasm: {
      package: PACKAGE_NAME,
      filePath: "/dist/br/br.wasm",
    },
    js: {
      package: PACKAGE_NAME,
      filePath: "/dist/br/br.min.js",
    }
  }
  return getManifestByConfig(config)
}

function getFreeCdnMainUrls() {
  const config = {
    package: PACKAGE_NAME,
    filePath: "/dist/freecdn-main.min.js",
  }
  fillVersionAndHash(config)
  return getCDNUrls(config)
}

module.exports = {
  getFreeCdnMainUrls,
  getBrWasmDecoderManifest,
  getJpegWasmDecoderManifest,
}