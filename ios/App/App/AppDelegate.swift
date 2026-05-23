import UIKit
import AVFoundation
import UserNotifications
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Pin AVAudioSession to `.ambient`. iOS WKWebView otherwise
        // defaults the session to `.playAndRecord` for apps that
        // declare any media capability — even when the app never
        // records. That category routes ALL audio (including other
        // apps' notifications, incoming calls, etc.) through the
        // shared audio engine with acoustic echo cancellation
        // applied, which the user hears as "weird echoey" system
        // sounds while Hai is in the foreground. `.ambient`
        // explicitly says: play our UI sounds mixed with everyone
        // else, never silence or process other apps' audio.
        // mixWithOthers in options is implied by `.ambient` but set
        // explicitly so a future iOS revision can't quietly change
        // the default.
        pinAmbientAudioSession()
        return true
    }

    /// Force the shared audio session back to `.ambient` (mixable, never
    /// records). Must be RE-applied on every activation: declaring the mic
    /// (for chat voice notes) lets iOS / WKWebView re-escalate the session
    /// to `.playAndRecord` after a recording or audio-context init, which
    /// the user hears as echoey system / call audio. Pinning once at launch
    /// isn't enough — we re-assert it whenever the app comes to the front.
    private func pinAmbientAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setCategory(
                .ambient,
                mode: .default,
                options: [.mixWithOthers]
            )
            try AVAudioSession.sharedInstance().setActive(true, options: [])
        } catch {
            // Non-fatal — UI sounds still play, the session just
            // stays at whatever WKWebView's default is.
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Re-assert the ambient audio session — see pinAmbientAudioSession().
        pinAmbientAudioSession()
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Re-assert the ambient audio session every time the app becomes
        // active, so a prior voice-note recording can't leave the WKWebView
        // stuck on `.playAndRecord` (the echo cause).
        pinAmbientAudioSession()
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    // ── Push Notifications — REQUIRED forwarders ────────────────────────
    // Capacitor's @capacitor/push-notifications plugin listens for these
    // two iOS delegate callbacks via NotificationCenter. Without explicit
    // forwarders here the plugin never sees the device token and
    // register() silently times out after ~10s — which is why every
    // iOS build was hitting register_timeout in the diagnostic. See:
    // https://capacitorjs.com/docs/apis/push-notifications#ios
    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(
            name: .capacitorDidRegisterForRemoteNotifications,
            object: deviceToken
        )
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(
            name: .capacitorDidFailToRegisterForRemoteNotifications,
            object: error
        )
    }

    // ── Silent / background pushes (apns-push-type: background) ─────────
    // Without this forwarder, iOS receives our silent cleanup pushes
    // (content-available: 1) but never wakes the JS layer.
    //
    // First attempt forwarded `capacitorDidReceiveRemoteNotification`
    // via NotificationCenter, but the @capacitor/push-notifications
    // plugin only listens for the registration callbacks — there's
    // no observer for didReceive. So we bridge directly: grab the
    // PushNotifications plugin instance off the Capacitor bridge and
    // call `notifyListeners` on it ourselves. That fires the same
    // `pushNotificationReceived` event the plugin uses for foreground
    // alerts, so our existing JS handler (the silent-push branch in
    // PushRegistration.tsx) just works.
    //
    // Always finish with `.newData` so iOS doesn't deprioritize
    // future silent pushes for this app.
    func application(_ application: UIApplication,
                     didReceiveRemoteNotification userInfo: [AnyHashable: Any],
                     fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        // Cleanup pushes carry { cleanup: "true", contentType, contentId }
        // and need to remove a delivered notification from Notification
        // Center. We handle them NATIVELY here instead of bouncing
        // through the JS bridge because the bridge is suspended when
        // the app is backgrounded — JS-side removeDeliveredByRef would
        // never fire, leaving the banner stale until the user opens
        // the app and sweepStaleTray runs. iOS gives us a ~30s window
        // in background mode to do native work, which is plenty.
        if let cleanupFlag = userInfo["cleanup"] as? String, cleanupFlag == "true",
           let contentType = userInfo["contentType"] as? String,
           let contentId = userInfo["contentId"] as? String {
            removeDeliveredNotificationsNatively(contentType: contentType, contentId: contentId) {
                completionHandler(.newData)
            }
            return
        }

        // Non-cleanup pushes (silent or otherwise) still get forwarded
        // to JS so any future foreground listener can react.
        forwardSilentPushToCapacitor(userInfo: userInfo)
        completionHandler(.newData)
    }

    /// Remove delivered notifications matching `contentType` + `contentId`
    /// without touching the JS layer. Called from the silent-push handler
    /// so cleanup works while the app is backgrounded.
    private func removeDeliveredNotificationsNatively(
        contentType: String,
        contentId: String,
        completion: @escaping () -> Void
    ) {
        UNUserNotificationCenter.current().getDeliveredNotifications { delivered in
            let toRemoveIds: [String] = delivered.compactMap { notif in
                let d = notif.request.content.userInfo
                let dContentType = d["contentType"] as? String
                let dContentId = d["contentId"] as? String
                if dContentType == contentType && dContentId == contentId {
                    return notif.request.identifier
                }
                // Legacy fallback: older payloads only had threadId /
                // postId / commentId / rideRequestId, no contentType/Id.
                let legacyKey: String?
                switch contentType {
                case "post":        legacyKey = d["postId"]        as? String
                case "comment":     legacyKey = d["commentId"]     as? String
                case "thread":      legacyKey = d["threadId"]      as? String
                case "rideRequest": legacyKey = d["rideRequestId"] as? String
                default:            legacyKey = nil
                }
                if legacyKey == contentId {
                    return notif.request.identifier
                }
                return nil
            }
            if !toRemoveIds.isEmpty {
                UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: toRemoveIds)
            }
            completion()
        }
    }

    private func forwardSilentPushToCapacitor(userInfo: [AnyHashable: Any]) {
        // Walk the active scenes / windows to find the CAPBridgeViewController.
        // We don't store a reference at launch because Capacitor instantiates
        // the bridge lazily and the rootViewController may not be set in
        // didFinishLaunchingWithOptions yet on a cold-start silent-push wake.
        var rootVC: UIViewController? = window?.rootViewController
        if rootVC == nil {
            for scene in UIApplication.shared.connectedScenes {
                if let ws = scene as? UIWindowScene,
                   let win = ws.windows.first(where: { $0.isKeyWindow }) ?? ws.windows.first {
                    rootVC = win.rootViewController
                    if rootVC != nil { break }
                }
            }
        }
        guard let bridgeVC = rootVC as? CAPBridgeViewController,
              let bridge = bridgeVC.bridge,
              let plugin = bridge.plugin(withName: "PushNotificationsPlugin")
                ?? bridge.plugin(withName: "PushNotifications") else {
            // Bridge not ready yet (rare cold-start case). Best we can do
            // is store the userInfo and hand it to the plugin once the
            // app finishes launching — but that's complex for a marginal
            // win. The next sweepStaleTray() pass will catch it on resume.
            return
        }

        // Build the same event shape Capacitor uses for foreground alerts:
        //   { id, title, subtitle, body, data: {...payload minus aps} }
        // The JS listener reads `notification.data.cleanup` etc., so if
        // we just hand userInfo through verbatim there's no `data` field
        // and the cleanup branch never runs (build 48 hit this — the
        // ◀ pushNotificationReceived line showed up, but title/body
        // were empty and no data: line followed).
        var dataPayload: [String: Any] = [:]
        for (k, v) in userInfo {
            guard let key = k as? String, key != "aps" else { continue }
            dataPayload[key] = v
        }
        let aps = userInfo["aps"] as? [String: Any]
        let alert = aps?["alert"] as? [String: Any]
        let title  = alert?["title"]    as? String ?? aps?["alert"] as? String ?? ""
        let subtitle = alert?["subtitle"] as? String ?? ""
        let body   = alert?["body"]     as? String ?? ""
        let id = (dataPayload["notificationId"] as? String) ?? UUID().uuidString

        let event: [String: Any] = [
            "id":       id,
            "title":    title,
            "subtitle": subtitle,
            "body":     body,
            "data":     dataPayload,
        ]
        plugin.notifyListeners(
            "pushNotificationReceived",
            data: event,
            retainUntilConsumed: true
        )
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
