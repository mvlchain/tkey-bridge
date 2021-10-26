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
    private var torusShare: String?
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
        loginButton.addTarget(self, action: #selector(didTapLoginButton), for: .touchUpInside)

        if let filePath = Bundle.main.path(forResource: "index", ofType: "html", inDirectory: "assets") {
            let url = URL.init(fileURLWithPath: filePath)
            webViewHandler.loadFileURL(url)
        }
    }

    @objc private func didTapLoginButton() {
        torusSdk.triggerLogin(browserType: .external).done { [weak self] data in
            if let postboxKey = data["privateKey"] as? String {
                print("private key rebuild", postboxKey)
                self?.postboxKey = postboxKey
                self?.splitKey()
            }
            if let userInfo = data["userInfo"] as? NSDictionary, let email = userInfo["email"] as? String {
                print("email", email)
                self?.loginId = email
            }
        }.catch { error in
            print(error)
        }
    }

    private func generateRandom() -> String {
        /** A UUID consists of 16 octets, i.e. 16 groups of 8 bits (16 × 8 = 128), that are represented as 32 hexadecimal digits, displayed in 5 groups, separated by hyphens
         https://learnappmaking.com/random-unique-identifier-uuid-swift-how-to/#:~:text=A%20UUID%20consists%20of%2016%20octets%2C%20i.e.%2016%20groups%20of%208%20bits%20(16%20%C3%97%208%20%3D%20128)%2C%20that%20are%20represented%20as%2032%20hexadecimal%20digits%2C%20displayed%20in%205%20groups%2C%20separated%20by%20hyphens
         */
        let uuidString = UUID().uuidString.replacingOccurrences(of: "-", with: "")
        return uuidString
    }
}

// MARK: Call Javascript

extension ViewController {

    private func splitKey() {
        guard let postboxKey = postboxKey else {
            return
        }
        let privateKey = generateRandom()
        print("generateRandom", privateKey)
        let javascriptString = "splitKey('\(postboxKey)','\(privateKey)')"
        webViewHandler.callJavascript(javascriptString: javascriptString) { (success, result) in
            if let result = result {
                print(result)
            }
        }
    }

    private func saveTorusShare() {
        guard let postboxKey = postboxKey, let torusShare = torusShare, let loginId = loginId else {
            return
        }
        let javascriptString = "saveTorusShare('\(postboxKey)','\(torusShare)','\(loginId)')"
        webViewHandler.callJavascript(javascriptString: javascriptString) { (success, result) in
            if let result = result {
                print(result)
            }
        }
    }

    private func reconstructKeyWithTorusShare() {
        guard let postboxKey = postboxKey, let torusShare = torusShare else {
            return
        }
        let javascriptString = "reconstructKeyWithTorusShare('\(postboxKey)','\(torusShare)')"
        webViewHandler.callJavascript(javascriptString: javascriptString) { (success, result) in
            if let result = result {
                print(result)
            }
        }
    }
}

// MARK: WebViewHandlerDelegate

extension ViewController: WebViewHandlerDelegate {

    enum Command: String {
        case keySplitFinished, torusShareSaved, privateKeyReconstructed
    }

    func didLoadPage(isLoaded: Bool) {
        loginButton.isEnabled = isLoaded
    }

    func didReceiveDictionary(dict: Dictionary<String, Any>) {
        guard let command = dict["command"] as? String else {
            return
        }
        switch command {
        case Command.keySplitFinished.rawValue:
            print("tkey", "shareJson = \(dict)")
            guard let params = dict["params"] as? Dictionary<String, Any>,
                  let ts = params["ts"] as? Dictionary<String, Any>,
                  let ss = params["ss"]as? Dictionary<String, Any>,
                  let ds = params["ds"] as? Dictionary<String, Any> else {
                return
            }
            do {
                torusShare = try ts.toJson()
                ssJson = try ss.toJson()
                dsJson = try ds.toJson()
                saveTorusShare()
            } catch {
                print(error)
            }

        case Command.torusShareSaved.rawValue:
            print("tkey", "torus share saved")
            reconstructKeyWithTorusShare()
        case Command.privateKeyReconstructed.rawValue:
            print("tkey", "private key restored = \(dict)")
        default:
            print("This commnand doesn't handle yet.", command)
        }
    }
}

// MARK: Convert Dictionary to json

extension Dictionary {

    /// Convert Dictionary to JSON string
    /// - Throws: exception if dictionary cannot be converted to JSON data or when data cannot be converted to UTF8 string
    /// - Returns: JSON string
    func toJson() throws -> String {
        let data = try JSONSerialization.data(withJSONObject: self)
        if let string = String(data: data, encoding: .utf8) {
            return string
        }
        throw NSError(domain: "Dictionary", code: 1, userInfo: ["message": "Data cannot be converted to .utf8 string"])
    }
}
