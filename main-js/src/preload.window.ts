/**
 * This script would be run on the window client
 */

function preloadScriptsOnWindowClient() {
  function appendScript(src: any) {
    const script = document.createElement('script');
    script.src = src;
    document.body.appendChild(script);
  }

  function appendStyle(src: any) {
    // load stylesheet asynchronously
    // <link href=css/chunk-vendors.357b52c2.css rel=stylesheet media=print onload="this.media='all'"
    const link = document.createElement('link');
    link.href = src;
    link.rel = "stylesheet"
    link.media = "print"
    link.onload = () => {
      link.media = "all"
    }
    document.head.appendChild(link);
  }

  // @ts-ignore
  const preloadScripts = PRELOAD_PATHS_PLACEHOLDER;
  preloadScripts.map((path: string) => {
    if (path.includes('.css')) {
      appendStyle(path);
    } else if (path.includes('.js')) {
      appendScript(path);
    }
  });
}

function wrapPreload() {
  const preloadScript = preloadScriptsOnWindowClient.toString()
  return `(function() {
    window.addEventListener('DOMContentLoaded', (event) => {
      (${preloadScript})();
    });
  })();`
}