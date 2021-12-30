const fs = require('fs');
const path = require('path');

function escapeScript(script) {
  // Escape special characters in script
  // 1. handle \n
  script = script.replaceAll("\\", "\\\\"); 
  // 2. handler string interpolation
  script = script.replaceAll("`", "\\`");
  script = script.replaceAll("$", "\\$");
  return script;
}

function getJpegBrowserDecoder() {
  const jpegDecoderPath = require.resolve("@zckevin/jpeg-channel-browser-decoder")
  const jpegDecoderContent = fs.readFileSync(jpegDecoderPath, 'utf8')
  
  const jpegDecoderInitScriptPath =
      path.resolve(__dirname, "./core-lib/src/param-mods/init-jpeg.js")
  const initScriptContent = fs.readFileSync(jpegDecoderInitScriptPath, 'utf8')

  let script = `console.log("Entering jpeg BrowserDecoder script");
    ${jpegDecoderContent}
    ${initScriptContent}`

  return escapeScript(script);
}

/**
 * @param {string} decoderType 
 * @returns 
 */
function getJpegDecoderConfig(decoderType) {
  if (decoderType === 'browser') {
    return {
      jpegBrowserDecoderScript: getJpegBrowserDecoder(),
      useJpegBrowserDecoder: true,
    }
  } else if (decoderType === 'wasm') {
    return {
      useJpegWasmDecoder: true,
    }
  }
  throw new Error(`Unknown decoder type: ${decoderType}`)
}

module.exports = {
  getJpegDecoderConfig
}
