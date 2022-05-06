//
//  ViewController.swift
//  tkeybridgetest
//
//  Created by Tam Nguyen on 24/10/2021.
//

import UIKit
import WebKit
import CustomAuth
import FetchNodeDetails
import PromiseKit
import SafariServices
import CryptoSwift

final class ViewController: UIViewController {

    private let splitButton = UIButton(type: .system)
    private let reconstructKeyByDeviceShareButton = UIButton(type: .system)
    private let reconstructKeyByServerShareButton = UIButton(type: .system)
    private let reconstructKeyWithSharesButton = UIButton(type: .system)
    private let getTorusShareButton = UIButton(type: .system)
    private let deleteButton = UIButton(type: .system)
    private let clearCacheButton = UIButton(type: .system)

    private let webViewHandler = WebViewHandler()

    lazy var torusSdk: CustomAuth = {
        let sub = SubVerifierDetails(
            loginProvider: .google,
            clientId: "354250895959-dneacv3fol73d6a6lf789mcjo2jjpbms.apps.googleusercontent.com",
            verifierName: "clutch-google-testnet",
            redirectURL: "tdsdk://tdsdk/oauthCallback",
            browserRedirectURL: "https://scripts.toruswallet.io/redirect.html"
        )
        return CustomAuth(
            aggregateVerifierType: .singleLogin,
            aggregateVerifierName: "clutch-google-testnet1",
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
        view.addSubview(splitButton)
        view.addSubview(reconstructKeyByDeviceShareButton)
        view.addSubview(reconstructKeyByServerShareButton)
        view.addSubview(reconstructKeyWithSharesButton)
        view.addSubview(getTorusShareButton)
        view.addSubview(deleteButton)
        view.addSubview(clearCacheButton)

        splitButton.translatesAutoresizingMaskIntoConstraints = false
        reconstructKeyByDeviceShareButton.translatesAutoresizingMaskIntoConstraints = false
        reconstructKeyByServerShareButton.translatesAutoresizingMaskIntoConstraints = false
        reconstructKeyWithSharesButton.translatesAutoresizingMaskIntoConstraints = false
        getTorusShareButton.translatesAutoresizingMaskIntoConstraints = false
        deleteButton.translatesAutoresizingMaskIntoConstraints = false
        clearCacheButton.translatesAutoresizingMaskIntoConstraints = false
        let constraints = [
            splitButton.topAnchor.constraint(equalTo: view.topAnchor, constant: 60.0),
            splitButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 30.0),
            splitButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -30.0),
            splitButton.heightAnchor.constraint(equalToConstant: 44.0),

            reconstructKeyByDeviceShareButton.topAnchor.constraint(equalTo: splitButton.bottomAnchor, constant: 30.0),
            reconstructKeyByDeviceShareButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 30.0),
            reconstructKeyByDeviceShareButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -30.0),
            reconstructKeyByDeviceShareButton.heightAnchor.constraint(equalToConstant: 44.0),

            reconstructKeyByServerShareButton.topAnchor.constraint(equalTo: reconstructKeyByDeviceShareButton.bottomAnchor, constant: 30.0),
            reconstructKeyByServerShareButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 30.0),
            reconstructKeyByServerShareButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -30.0),
            reconstructKeyByServerShareButton.heightAnchor.constraint(equalToConstant: 44.0),

            reconstructKeyWithSharesButton.topAnchor.constraint(equalTo: reconstructKeyByServerShareButton.bottomAnchor, constant: 30.0),
            reconstructKeyWithSharesButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 30.0),
            reconstructKeyWithSharesButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -30.0),
            reconstructKeyWithSharesButton.heightAnchor.constraint(equalToConstant: 44.0),

            getTorusShareButton.topAnchor.constraint(equalTo: reconstructKeyWithSharesButton.bottomAnchor, constant: 30.0),
            getTorusShareButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 30.0),
            getTorusShareButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -30.0),
            getTorusShareButton.heightAnchor.constraint(equalToConstant: 44.0),

            deleteButton.topAnchor.constraint(equalTo: getTorusShareButton.bottomAnchor, constant: 30.0),
            deleteButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 30.0),
            deleteButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -30.0),
            deleteButton.heightAnchor.constraint(equalToConstant: 44.0),

            clearCacheButton.topAnchor.constraint(equalTo: deleteButton.bottomAnchor, constant: 30.0),
            clearCacheButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 30.0),
            clearCacheButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -30.0),
            clearCacheButton.heightAnchor.constraint(equalToConstant: 44.0)
        ]

        NSLayoutConstraint.activate(constraints)
    }

    private func setUpViews() {
        splitButton.layer.cornerRadius = 8.0
        splitButton.backgroundColor = .blue
        splitButton.setTitle("Split private key", for: .normal)
        splitButton.setTitleColor(.white, for: .normal)
        splitButton.isEnabled = false
        splitButton.addTarget(self, action: #selector(didTapSplitButton), for: .touchUpInside)

        reconstructKeyByDeviceShareButton.layer.cornerRadius = 8.0
        reconstructKeyByDeviceShareButton.backgroundColor = .systemBlue
        reconstructKeyByDeviceShareButton.setTitle("Reconstruct Key By Device Share", for: .normal)
        reconstructKeyByDeviceShareButton.setTitleColor(.white, for: .normal)
        reconstructKeyByDeviceShareButton.isEnabled = false
        reconstructKeyByDeviceShareButton.addTarget(self, action: #selector(didTapReconstructKeyByDeviceShareButton), for: .touchUpInside)

        reconstructKeyByServerShareButton.layer.cornerRadius = 8.0
        reconstructKeyByServerShareButton.backgroundColor = .systemBlue
        reconstructKeyByServerShareButton.setTitle("Reconstruct Key By Server Share", for: .normal)
        reconstructKeyByServerShareButton.setTitleColor(.white, for: .normal)
        reconstructKeyByServerShareButton.isEnabled = false
        reconstructKeyByServerShareButton.addTarget(self, action: #selector(didTapReconstructKeyByServerShareButton), for: .touchUpInside)

        reconstructKeyWithSharesButton.layer.cornerRadius = 8.0
        reconstructKeyWithSharesButton.backgroundColor = .systemBlue
        reconstructKeyWithSharesButton.setTitle("Reconstruct Key With Server and Device shares", for: .normal)
        reconstructKeyWithSharesButton.setTitleColor(.white, for: .normal)
        reconstructKeyWithSharesButton.isEnabled = false
        reconstructKeyWithSharesButton.addTarget(self, action: #selector(didTapReconstructKeyWithSharesButton), for: .touchUpInside)

        getTorusShareButton.layer.cornerRadius = 8.0
        getTorusShareButton.backgroundColor = .green
        getTorusShareButton.setTitle("Get Torus Share", for: .normal)
        getTorusShareButton.setTitleColor(.white, for: .normal)
        getTorusShareButton.isEnabled = false
        getTorusShareButton.addTarget(self, action: #selector(didTapGetTorusShareButton), for: .touchUpInside)

        deleteButton.layer.cornerRadius = 8.0
        deleteButton.backgroundColor = .red
        deleteButton.setTitle("Delete Torus share", for: .normal)
        deleteButton.setTitleColor(.white, for: .normal)
        deleteButton.isEnabled = false
        deleteButton.addTarget(self, action: #selector(didTapDeleteButton), for: .touchUpInside)

        clearCacheButton.layer.cornerRadius = 8.0
        clearCacheButton.backgroundColor = .gray
        clearCacheButton.setTitle("Clear local cache", for: .normal)
        clearCacheButton.setTitleColor(.white, for: .normal)
        clearCacheButton.isEnabled = false
        clearCacheButton.addTarget(self, action: #selector(didTapClearCacheButton), for: .touchUpInside)

        webViewHandler.delegate = self
    }

    @objc private func didTapSplitButton() {
        torusSdk.triggerLogin(browserType: .external).done { [weak self] data in
            if let postboxKey = data["privateKey"] as? String {
                print("postboxKey: ", postboxKey)
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

    @objc private func didTapReconstructKeyByDeviceShareButton() {
        reconstructKeyWithTorusShareByDeviceShare()
    }

    @objc private func didTapReconstructKeyByServerShareButton() {
        reconstructKeyWithTorusShareByServerShare()
    }

    @objc private func didTapReconstructKeyWithSharesButton() {
        reconstructKeyWithShares()
    }

    @objc private func didTapGetTorusShareButton() {
        torusSdk.triggerLogin(browserType: .external).done { [weak self] data in
            if let postboxKey = data["privateKey"] as? String {
                print("postboxKey: ", postboxKey)
                self?.postboxKey = postboxKey
                self?.getTorusShare()
            }
            if let userInfo = data["userInfo"] as? NSDictionary, let email = userInfo["email"] as? String {
                print("email", email)
                self?.loginId = email
            }
        }.catch { error in
            print(error)
        }
    }

    @objc private func didTapDeleteButton() {
        torusSdk.triggerLogin(browserType: .external).done { [weak self] data in
            if let postboxKey = data["privateKey"] as? String {
                print("postboxKey: ", postboxKey)
                self?.postboxKey = postboxKey
                self?.deleteTorusShare()
            }
            if let userInfo = data["userInfo"] as? NSDictionary, let email = userInfo["email"] as? String {
                print("email", email)
                self?.loginId = email
            }
        }.catch { error in
            print(error)
        }
    }

    @objc private func didTapClearCacheButton() {
        torusShare = nil
        ssJson = nil
        dsJson = nil
        loginId = nil
        postboxKey = nil
        printLocalCache()
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
            return print("Missing params to call splitKey")
        }
        let privateKey = generateRandom()
        let javascriptString = "splitKey('\(postboxKey)','\(privateKey)')"
        webViewHandler.callJavascript(javascriptString: javascriptString) { _,_  in }
    }

    private func reconstructKeyWithTorusShareByDeviceShare() {
        guard let postboxKey = postboxKey, let deviceShare = dsJson else {
            return print("Missing params to call reconstructKeyWithTorusShareByDeviceShare")
        }
        let javascriptString = "reconstructKeyWithTorusShare('\(postboxKey)','\(deviceShare)')"
        webViewHandler.callJavascript(javascriptString: javascriptString) { _,_  in }
    }

    private func reconstructKeyWithTorusShareByServerShare() {
        guard let postboxKey = postboxKey, let serverShare = ssJson else {
            return print("Missing params to call reconstructKeyWithTorusShareByServerShare")
        }
        let javascriptString = "reconstructKeyWithTorusShare('\(postboxKey)','\(serverShare)')"
        webViewHandler.callJavascript(javascriptString: javascriptString) { _,_  in }
    }

    private func reconstructKeyWithShares() {
        guard let serverShare = ssJson, let deviceShare = dsJson else {
            return print("Missing params to call reconstructKeyWithShares")
        }
        let javascriptString = "reconstructKeyWithShares('\(serverShare)','\(deviceShare)')"
        webViewHandler.callJavascript(javascriptString: javascriptString) { _,_  in }
    }

    private func getTorusShare() {
        guard let postboxKey = postboxKey else {
            return print("Missing params to call getTorusShare")
        }
        let javascriptString = "getTorusShare('\(postboxKey)')"
        webViewHandler.callJavascript(javascriptString: javascriptString) { _,_  in }
    }

    private func deleteTorusShare() {
        guard let postboxKey = postboxKey else {
            return print("Missing params to call deleteTorusShare")
        }
        let javascriptString = "deleteTorusShare('\(postboxKey)')"
        webViewHandler.callJavascript(javascriptString: javascriptString) { _,_  in }
    }

    private func printLocalCache() {
        print("torusShare: ", torusShare ?? "")
        print("ssJson: ", ssJson ?? "")
        print("dsJson: ", dsJson ?? "")
        print("loginId: ", loginId ?? "")
        print("postboxKey: ", postboxKey ?? "")
    }
}

// MARK: WebViewHandlerDelegate

extension ViewController: WebViewHandlerDelegate {

    enum Command: String {
        case keySplitFinished, privateKeyReconstructedWithShares, privateKeyReconstructed, torusShareRetrieved,
             torusShareDeleted
        case keySplitFailed, privateKeyReconstructFailed, torusShareRetrieveFailed, noTorusShareRetrieved,
             torusShareDeleteFailed
    }

    func didLoadPage(isLoaded: Bool) {
        splitButton.isEnabled = isLoaded
        reconstructKeyByDeviceShareButton.isEnabled = isLoaded
        reconstructKeyByServerShareButton.isEnabled = isLoaded
        reconstructKeyWithSharesButton.isEnabled = isLoaded
        getTorusShareButton.isEnabled = isLoaded
        deleteButton.isEnabled = isLoaded
        clearCacheButton.isEnabled = isLoaded
    }

    func didReceiveDictionary(dict: Dictionary<String, Any>) {
        print("-------", "response = \(dict)")
        guard let command = dict["command"] as? String else {
            return
        }
        switch command {
        case Command.keySplitFinished.rawValue:
            print("tkey", "shareJson = \(dict)")
            guard let params = dict["params"] as? Dictionary<String, Any>,
                  let ts = params["ts"] as? String,
                  let ss = params["ss"] as? String,
                  let ds = params["ds"] as? String else {
                return print("Fail to parse shareJson of keySplitFinished")
            }
            torusShare = ts
            ssJson = ss
            dsJson = ds
            print("All key was saved in local.")
            printLocalCache()
        case Command.torusShareRetrieved.rawValue:
            guard let torusShare = dict["params"] as? String else {
                return print("Missing params key")
            }
            self.torusShare = torusShare
            printLocalCache()
        default:
            print("This commnand doesn't handle yet.", command)
        }
    }
}
