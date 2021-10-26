function callNative01(name) {
    console.log('hello’');
    // @ts-ignore
    window.webkit.messageHandlers.sendNative01.postMessage({"name": name});
}

// @ts-ignore
// window.callNative01 = callNative01;
