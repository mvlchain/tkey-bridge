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

    let scriptName = "tkeybridge"
    var webView: WKWebView!
    weak var delegate: WebViewHandlerDelegate?

    private var pageLoaded = false
    private var pendingFunctions = [JavascriptFunction]()

    override init() {
        super.init()
        let preferences = WKPreferences()
        preferences.javaScriptEnabled = true
        let configuration = WKWebViewConfiguration()
        configuration.preferences = preferences
        configuration.userContentController.add(self, name: scriptName)
        webView = WKWebView(frame: CGRect.zero, configuration: configuration)
        webView.navigationDelegate = self
    }

    deinit {
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
        if message.name == scriptName {
            if let dict = message.body as? Dictionary<String, Any> {
                delegate?.didReceiveDictionary(dict: dict)
            } else {
                print("This body doesn't handle yet.", message.body)
            }
        }
    }
}
