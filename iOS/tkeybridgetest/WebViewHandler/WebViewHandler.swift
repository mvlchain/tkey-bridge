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
    func didReceiveMessage(message: Any)
    func didReceiveParameters(parameters:[String: Any])
}

final class WebViewHandler: NSObject {

    var webView: WKWebView!
    let tkeybridge = "tkeybridge"
    weak var delegate: WebViewHandlerDelegate?

    private var pageLoaded = false
    private var pendingFunctions = [JavascriptFunction]()

    override init() {
        super.init()
        let preferences = WKPreferences()
        preferences.javaScriptEnabled = true
        let configuration = WKWebViewConfiguration()
        configuration.preferences = preferences
        configuration.userContentController.add(self, name: tkeybridge)
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

    func load(_ request: URLRequest) {
        pageLoaded = false
        webView.load(request)
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

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = navigationAction.request.url
        if let urlString = url?.absoluteString,
           urlString.starts(with: tkeybridge),
           let parameters = ParametersHandler.decodeParameters(inString: url!.absoluteString) {
            delegate?.didReceiveParameters(parameters: parameters)
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        print(#function)
    }
}

//MARK: - WKScriptMessageHandler

extension WebViewHandler: WKScriptMessageHandler {

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == tkeybridge {
            if let body = message.body as? [String: AnyObject] {
                delegate?.didReceiveMessage(message: body)
            } else if let body = message.body as? String {
                if let parameters = ParametersHandler.decodeParameters(inString: body) {
                    delegate?.didReceiveParameters(parameters: parameters)
                }
            }
        }
    }
}

//MARK: - WKURLSchemeHandler

extension WebViewHandler: WKURLSchemeHandler {

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        print("-----start------\(urlSchemeTask)----------")
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        print("-----stop------\(urlSchemeTask)----------")
    }
}
