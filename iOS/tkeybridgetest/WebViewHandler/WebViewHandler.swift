//
//  WebViewHandler.swift
//  tkeybridgetest
//
//  Created by Tam Nguyen on 25/10/2021.
//

import Foundation
import WebKit

protocol WebViewHandlerDelegate: AnyObject {
    func didLoadPage(isLoaded: Bool)
    func didReceiveDictionary(dict: Dictionary<String, Any>)
}

final class WebViewHandler: NSObject {

    let tkeybridge = "tkeybridge"
    private let logging = "logging"
    private let configuration = WKWebViewConfiguration()
    var webView: WKWebView!
    weak var delegate: WebViewHandlerDelegate?

    private var pageLoaded = false
    private var pendingFunctions = [JavascriptFunction]()

    override init() {
        super.init()
        let preferences = WKPreferences()
        preferences.javaScriptEnabled = true
        configuration.preferences = preferences
        configuration.userContentController.add(self, name: tkeybridge)

        let overrideConsole = """
            function log(emoji, type, args) {
              window.webkit.messageHandlers.logging.postMessage(
                `${emoji} TKeyBridge ${type}: ${Object.values(args)
                  .map(v => typeof(v) === "undefined" ? "undefined" : typeof(v) === "object" ? JSON.stringify(v) : v.toString())
                  .map(v => v.substring(0, 3000)) // Limit msg to 3000 chars
                  .join(", ")}`
              )
            }

            let originalLog = console.log
            let originalWarn = console.warn
            let originalError = console.error
            let originalDebug = console.debug

            console.log = function() { log("📗", "log", arguments); originalLog.apply(null, arguments) }
            console.info = function() { log("📗", "info", arguments); originalLog.apply(null, arguments) }
            console.trace = function() { log("📗", "trace", arguments); originalLog.apply(null, arguments) }
            console.warn = function() { log("📙", "warning", arguments); originalWarn.apply(null, arguments) }
            console.error = function() { log("📕", "error", arguments); originalError.apply(null, arguments) }
            console.debug = function() { log("📘", "debug", arguments); originalDebug.apply(null, arguments) }

            window.addEventListener("error", function(e) {
               log("💥", "Uncaught", [`${e.message} at ${e.filename}:${e.lineno}:${e.colno}`])
            })
        """
        configuration.userContentController.add(self, name: logging)
        configuration.userContentController.addUserScript(
            WKUserScript(source: overrideConsole, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )

        webView = WKWebView(frame: CGRect.zero, configuration: configuration)

        if let filePath = Bundle.main.path(forResource: "index", ofType: "html", inDirectory: "assets") {
            let url = URL.init(fileURLWithPath: filePath)
            webView?.navigationDelegate = self
            loadFileURL(url)
        }
    }

    deinit {
        webView?.stopLoading()
        configuration.userContentController.removeScriptMessageHandler(forName: tkeybridge)
        configuration.userContentController.removeScriptMessageHandler(forName: logging)
        webView = nil
    }

    func callJavascript(javascriptString: String, callback: @escaping JavascriptCallback) {
        if pageLoaded {
            callJavascriptFunction(function: makeFunction(withString: javascriptString, andCallback: callback))
        } else {
            addFunction(function: makeFunction(withString: javascriptString, andCallback: callback))
        }
    }

    func loadFileURL(_ url: URL) {
        pageLoaded = false
        webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
    }
}

//MARK: - Private functions

extension WebViewHandler {

    private func addFunction(function: JavascriptFunction) {
        pendingFunctions.append(function)
    }

    private func callJavascriptFunction(function: JavascriptFunction) {
        webView.evaluateJavaScript(function.functionString) { (response, error) in
            if let _ = error {
                function.callback(false, nil)
            } else {
                function.callback(true, response)
            }
        }
    }

    private func callPendingFunctions() {
        for function in pendingFunctions {
            callJavascriptFunction(function: function)
        }
        pendingFunctions.removeAll()
    }

    private func makeFunction(withString string: String, andCallback callback: @escaping JavascriptCallback) -> JavascriptFunction {
        JavascriptFunction(functionString: string, callback: callback)
    }
}

//MARK: - WKNavigationDelegate

extension WebViewHandler: WKNavigationDelegate {

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageLoaded = true
        delegate?.didLoadPage(isLoaded: true)
        callPendingFunctions()
    }
}

//MARK: - WKScriptMessageHandler

extension WebViewHandler: WKScriptMessageHandler {

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == logging {
            print(message.body)
        }
        if message.name == tkeybridge {
            if let dict = message.body as? Dictionary<String, Any> {
                delegate?.didReceiveDictionary(dict: dict)
            } else {
                print("This body doesn't handle yet.", message.body)
            }
        }
    }
}
