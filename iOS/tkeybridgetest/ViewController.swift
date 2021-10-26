//
//  ViewController.swift
//  tkeybridgetest
//
//  Created by Tam Nguyen on 24/10/2021.
//

import UIKit
import WebKit
import TorusSwiftDirectSDK
import FetchNodeDetails
import PromiseKit
import SafariServices
import CryptoSwift

final class ViewController: UIViewController {

    private let loginButton = UIButton(type: .system)

    lazy var webViewHandler: WebViewHandler = {
        let webViewHandler = WebViewHandler()
        webViewHandler.delegate = self
        return webViewHandler
    }()

    lazy var torusSdk: TorusSwiftDirectSDK = {
        let sub = SubVerifierDetails(
            loginProvider: .google,
            clientId: "354250895959-dneacv3fol73d6a6lf789mcjo2jjpbms.apps.googleusercontent.com",
            verifierName: "clutch-google-testnet",
            redirectURL: "tdsdk://tdsdk/oauthCallback",
            browserRedirectURL: "https://scripts.toruswallet.io/redirect.html"
        )
        return TorusSwiftDirectSDK(
            aggregateVerifierType: .singleLogin,
            aggregateVerifierName: "clutch-google-testnet",
            subVerifierDetails: [sub], network: .ROPSTEN
        )
    }()

    private var postboxKey: String?
    private var loginId: String?
    private var dsJson: String?
    private var ssJson: String?

    override func viewDidLoad() {
        super.viewDidLoad()
        setUpLayout()
        setUpViews()
    }
}

// MARK: Setup View

extension ViewController {

    private func setUpLayout() {
        view.addSubview(loginButton)
        loginButton.translatesAutoresizingMaskIntoConstraints = false
        let constraints = [
            loginButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            loginButton.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            loginButton.widthAnchor.constraint(equalToConstant: 140),
            loginButton.heightAnchor.constraint(equalToConstant: 44.0)
        ]
        NSLayoutConstraint.activate(constraints)
    }

    private func setUpViews() {
        loginButton.layer.cornerRadius = 8.0
        loginButton.backgroundColor = .blue
        loginButton.setTitle("Google Login", for: .normal)
        loginButton.setTitleColor(.white, for: .normal)
        loginButton.isEnabled = false
        loginButton.addTarget(self, action: #selector(callNative01), for: .touchUpInside)

        if let url = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "assets") {
            let request = URLRequest(url: url)
            webViewHandler.load(request)
        }
    }

    @objc private func didTapLoginButton() {
        torusSdk.triggerLogin(browserType: .external).done { [weak self] data in
            if let postboxKey = data["privateKey"] as? String {
                print("private key rebuild", postboxKey)
                self?.postboxKey = postboxKey
                self?.splitKey(postboxKey)
            }
            if let userInfo = data["userInfo"] as? NSDictionary, let email = userInfo["email"] as? String {
                print("email", email)
                self?.loginId = email
            }
        }.catch { error in
            print(error)
        }
    }

    private func splitKey(_ postboxKey: String) {
        let privateKey = generateRandom()
        let javascriptString = "splitKey('\(postboxKey)','\(privateKey)')"
        webViewHandler.callJavascript(javascriptString: javascriptString) { (success, result) in
            print(result)
            print(success)
            if let result = result {
                print(result)
            }
        }
    }

    @objc private func callNative01() {
        let javascriptTest = "callNative01('nguyen')"
        webViewHandler.callJavascript(javascriptString: javascriptTest) { (success, result) in
            print(result)
            print(success)
            if let result = result {
                print(result)
            }
        }
    }

    private func generateRandom() -> String {
        let prefixSize = Int(UInt32())
        let uuidString = UUID().uuidString.replacingOccurrences(of: "-", with: "")
        return String(Data(uuidString.utf8)
                        .base64EncodedString()
                        .replacingOccurrences(of: "=", with: "")
                        .prefix(prefixSize))
    }
}

extension ViewController: WebViewHandlerDelegate {

    func didLoadPage(isLoaded: Bool) {
        loginButton.isEnabled = isLoaded
    }

    func didReceiveMessage(message: Any) {
        print(message)
    }

    func didReceiveParameters(parameters: [String : Any]) {
        print(parameters)
    }
}
