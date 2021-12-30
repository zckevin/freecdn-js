/**
 * Runs in main window env, after jpeg-decoder script is loaded.
 * 
 * Because sw could not access Document, we need to handle
 * jpeg-decoder task in main window.
 * 
 * Post a messageChannel to sw after sw is ready, then sw could 
 * use the channel port to post jpeg-decoder task to main window.
 */

(function() {
  async function decodeJpeg(file, config) {
    if (!window.jpeg_decoder) {
      throw new Error('jpeg_decoder is not defined')
    }
    const { JpegDecoder, UsedBits } = window.jpeg_decoder;
    const usedBits = new UsedBits(config.usedBits.from, config.usedBits.to);
    const decoder = new JpegDecoder(usedBits, JpegDecoder.browserDecoder);
    return new Uint8Array(await decoder.Read(file, config.length));
  }
  
  async function handleJpegDecoderTask(msg, port1) {
    const {name, file, config, taskId} = msg.data;
    const decoded = await decodeJpeg(file, config);
    console.log("window: decoder task finish", taskId);
    port1.postMessage({
      name,
      taskId,
      decoded,
    });
  }
  
  async function handleSwTask(msg, port1) {
    console.log("window: recv", msg);
    const { name } = msg.data;
    if (name === "jpegDecoder") {
      handleJpegDecoderTask(msg, port1);
    } else {
      return;
    }
  }
  
  if (!navigator.serviceWorker) {
    return;
  }

  const msgCh = new MessageChannel();
  const { port1, port2 } = msgCh;
  navigator.serviceWorker.ready.then(() => {
    if (!navigator.serviceWorker.controller) {
      return;
    }
    port1.onmessage = (msg) => {
      handleSwTask(msg, port1);
    };
    navigator.serviceWorker.controller.postMessage({
      name: "windowClientReady",
    }, [port2]);
  });
})();