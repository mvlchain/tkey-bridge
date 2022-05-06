//
//  SceneDelegate.swift
//  tkeybridgetest
//
//  Created by Tam Nguyen on 24/10/2021.
//

import UIKit
import CustomAuth

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let _ = (scene as? UIWindowScene) else { return }
    }

    // Handle Universal logins
    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        guard userActivity.activityType == NSUserActivityTypeBrowsingWeb,
              let urlToOpen = userActivity.webpageURL else {
            return
        }
        CustomAuth.handle(url: urlToOpen)
    }

    // Hanlde Deep linkings
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let url = URLContexts.first?.url else {
            return
        }
        CustomAuth.handle(url: url)
    }
}

