import Capacitor
import Foundation
import Network
import UIKit
import WebKit

/// Bulletproof offline fallback for cold-start with no connectivity.
///
/// Capacitor's `server.errorPath` config sometimes doesn't fire on
/// iOS for `URLError.notConnectedToInternet` — the WebView ends up
/// white. Subclassing `CAPBridgeViewController` and overriding
/// `WKNavigationDelegate` callbacks gives us deterministic recovery:
///
///  - Main-frame load of the remote URL fails → load the bundled
///    `public/offline.html` shipped with the app's resources. The
///    page polls `/api/ping` and reloads the live app the moment the
///    radio comes back, so the user gets a working UI instantly.
///  - `NWPathMonitor` watches the path; when it transitions to
///    `.satisfied` and we're sitting on the offline page, the
///    WebView is sent back to the live remote URL on the main queue
///    — no manual "Try again" tap needed.
///
/// Wired into `Main.storyboard` by changing the root view controller's
/// custom class from `CAPBridgeViewController` to `MainViewController`.
@objc(MainViewController)
class MainViewController: CAPBridgeViewController {

    private static let remoteURLString = "https://app.hai-app.net"
    private static let offlineFileName = "offline"
    private static let offlineFileExt  = "html"

    /// True while we've explicitly loaded the bundled offline page.
    /// Prevents a recursion if the offline page itself ever fails.
    private var showingOfflineFallback = false

    /// Cold launch (especially from a tapped DM/notification) often fails the
    /// FIRST load because the radio isn't up yet — and for some carriers the
    /// radio + DNS can take 15-25s to warm up after the device was idle. We
    /// retry the remote URL patiently before falling back to the offline page
    /// so the user never sees "no internet" on a cold-start-from-notification
    /// that would have worked given another few seconds.
    ///
    /// Schedule: 5 retries × 1s, 5 × 2s, 5 × 3s = ~30s budget. The Capacitor
    /// splash stays up throughout (we never call hide() ourselves), so the
    /// user just sees the launch screen during the warmup, not a broken page.
    /// The PushNotifications plugin caches the launch action and replays it
    /// when the React listener attaches, so the DM target survives the retry.
    private var loadRetries = 0
    private static let maxLoadRetries = 15
    private func retryDelay(forAttempt n: Int) -> TimeInterval {
        if n < 5  { return 1.0 }
        if n < 10 { return 2.0 }
        return 3.0
    }

    /// `nil` until viewDidLoad runs — created lazily so we don't pay
    /// for the path monitor when the app is fully online.
    private var pathMonitor: NWPathMonitor?

    override func viewDidLoad() {
        super.viewDidLoad()

        // Capacitor sets its own webView.navigationDelegate during
        // bridge initialization. We swap in this VC as the delegate
        // *after* super.viewDidLoad() so Capacitor's plumbing is
        // fully wired, then forward calls back to the original
        // delegate via the chain stored in `capacitorDelegate`.
        if let webView = self.webView {
            self.capacitorDelegate = webView.navigationDelegate
            webView.navigationDelegate = self

            // iOS rubber-band is intentionally LEFT ON. The previous
            // `bounces = false` killed the bounce-past-edge effect on
            // the main feed / market / threads / profile screens,
            // which made them feel inert next to the comments sheet
            // (its inner scroller bounces because it's a separate
            // scroll view). Letting the WebView's main scroll view
            // bounce restores native iOS feel everywhere.
            webView.scrollView.bounces = true
            webView.scrollView.alwaysBounceVertical = true
            webView.scrollView.alwaysBounceHorizontal = false
            webView.scrollView.bouncesZoom = false

            // WebView + scroll view background — what iOS exposes
            // during rubber-band overscroll past the top or bottom
            // of the page. Without this, the bounce region paints
            // WKWebView's default (black on iOS dark mode)
            // regardless of html/body CSS, because the exposed area
            // isn't part of the document. Match dark-mode --hai-bg
            // from src/app/design-tokens.css (#19232a). Light mode
            // stays white.
            let darkBg = UIColor(red: 0x19/255.0,
                                 green: 0x23/255.0,
                                 blue: 0x2A/255.0,
                                 alpha: 1.0)
            if #available(iOS 13.0, *) {
                let dynamicBg = UIColor { trait in
                    trait.userInterfaceStyle == .dark ? darkBg : .white
                }
                webView.backgroundColor = dynamicBg
                webView.scrollView.backgroundColor = dynamicBg
            } else {
                webView.backgroundColor = darkBg
                webView.scrollView.backgroundColor = darkBg
            }

            // Native iOS edge-swipe back/forward. WKWebView uses the
            // exact same gesture recognizer Safari does: the page
            // tracks the finger 1:1 from the left edge, a snapshot of
            // the previous page slides in underneath, rubber-bands
            // back if you let go before the midpoint, commits the
            // history navigation with native spring physics if you
            // pass it. Capacitor leaves this off by default — turning
            // it on is the single switch that gives every back-stack
            // page (post detail → feed, profile → list, thread →
            // inbox, etc.) the proper iOS feel without any JS code.
            //
            // Doesn't conflict with horizontal pans inside the app
            // because the recognizer only arms within ~20pt of the
            // left screen edge; the lightbox swipe-to-dismiss and
            // chat horizontal gestures all start well past that
            // strip, so they keep working unchanged.
            webView.allowsBackForwardNavigationGestures = true
        }

        startPathMonitor()
    }

    // The original Capacitor navigationDelegate — Capacitor still
    // needs to receive these calls (cookies, plugin events, etc.),
    // so we forward every selector after running our own logic.
    private weak var capacitorDelegate: WKNavigationDelegate?

    // MARK: - Path monitoring (auto-recover on reconnect)

    private func startPathMonitor() {
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self = self else { return }
            guard path.status == .satisfied else { return }
            DispatchQueue.main.async {
                if self.showingOfflineFallback {
                    self.loadRemoteApp()
                }
            }
        }
        monitor.start(queue: DispatchQueue.global(qos: .utility))
        self.pathMonitor = monitor
    }

    deinit {
        pathMonitor?.cancel()
    }

    // MARK: - Load helpers

    private func loadRemoteApp() {
        guard let url = URL(string: MainViewController.remoteURLString) else { return }
        showingOfflineFallback = false
        webView?.load(URLRequest(url: url))
    }

    private func loadBundledOfflinePage() {
        // Resources copied via `npx cap sync` end up under
        // <Bundle>/public/offline.html. `Bundle.url(forResource:withExtension:subdirectory:)`
        // returns the right file:// URL we can hand WKWebView.
        guard let fileURL = Bundle.main.url(
            forResource: MainViewController.offlineFileName,
            withExtension: MainViewController.offlineFileExt,
            subdirectory: "public"
        ) else {
            // No bundled page — best we can do is show an inline string.
            webView?.loadHTMLString(
                "<!doctype html><html><body style=\"font-family:system-ui;text-align:center;padding:32px;\">"
                + "<h2>لا يوجد اتصال بالإنترنت</h2>"
                + "<p>No internet connection</p>"
                + "</body></html>",
                baseURL: nil
            )
            return
        }
        showingOfflineFallback = true
        // loadFileURL with the parent directory as readAccessURL so
        // the page can reference any sibling assets if we ever add them.
        let parent = fileURL.deletingLastPathComponent()
        webView?.loadFileURL(fileURL, allowingReadAccessTo: parent)
    }

    // MARK: - Failure routing

    private func handleMainFrameFailure(failedURL: URL?, error: Error) {
        guard !showingOfflineFallback else { return }
        // Only fall back for failures of the remote app — not for
        // unrelated subresources or for failures of the offline page
        // itself (which has a file:// URL, never matches the http host).
        guard let url = failedURL,
              url.absoluteString.hasPrefix(MainViewController.remoteURLString) else {
            return
        }

        // Treat any URLError that looks like "no network / no DNS / TLS
        // can't handshake" as offline. Server errors (e.g. cancelled
        // by user, schema redirect) we ignore here.
        let nsErr = error as NSError
        let urlErrorDomain = nsErr.domain == NSURLErrorDomain
        let offlineCode = urlErrorDomain && [
            NSURLErrorNotConnectedToInternet,
            NSURLErrorNetworkConnectionLost,
            NSURLErrorCannotFindHost,
            NSURLErrorCannotConnectToHost,
            NSURLErrorDNSLookupFailed,
            NSURLErrorTimedOut,
            NSURLErrorInternationalRoamingOff,
            NSURLErrorDataNotAllowed,
            NSURLErrorSecureConnectionFailed,
        ].contains(nsErr.code)

        if offlineCode {
            // Cold-start grace: launching from a notification, the radio can
            // take several seconds to come up. Retry the load patiently (~8s,
            // every 1s) before EVER showing the offline page — otherwise it
            // flashes the offline page AND the web app never runs, so the
            // notification's deep-link is lost. Splash stays up meanwhile.
            if loadRetries < MainViewController.maxLoadRetries {
                let delay = retryDelay(forAttempt: loadRetries)
                loadRetries += 1
                DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                    self?.webView?.load(URLRequest(url: url))
                }
                return
            }
            loadBundledOfflinePage()
        }
    }
}

// MARK: - WKNavigationDelegate (forward + intercept)

extension MainViewController: WKNavigationDelegate {

    // Reset our flag the moment a remote-URL navigation starts so a
    // fresh failure can re-trigger the fallback. (E.g. user taps
    // "Try again", succeeds, then later goes offline → another
    // failure should still route to the offline page.)
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        if let url = webView.url, url.absoluteString.hasPrefix(MainViewController.remoteURLString) {
            showingOfflineFallback = false
        }
        capacitorDelegate?.webView?(webView, didStartProvisionalNavigation: navigation)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleMainFrameFailure(failedURL: webView.url, error: error)
        capacitorDelegate?.webView?(webView, didFailProvisionalNavigation: navigation, withError: error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleMainFrameFailure(failedURL: webView.url, error: error)
        capacitorDelegate?.webView?(webView, didFail: navigation, withError: error)
    }

    // ── Pure forwarders below — keep Capacitor's plumbing intact ──

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        capacitorDelegate?.webView?(webView, didCommit: navigation)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // A successful remote load resets the retry budget.
        if let url = webView.url, url.absoluteString.hasPrefix(MainViewController.remoteURLString) {
            loadRetries = 0
        }
        capacitorDelegate?.webView?(webView, didFinish: navigation)
    }

    // The decision-handler delegate methods need a guaranteed call to
    // their handler — the WebView hangs forever otherwise. We forward
    // to Capacitor's delegate via optional chaining; calling an
    // optional protocol method on an instance that doesn't implement
    // it returns nil, in which case we call decisionHandler ourselves
    // with the safe default. (The previous #selector cast pattern
    // broke under Xcode 26.2 / iOS 26 SDK because WKNavigationDelegate
    // gained @MainActor + @Sendable annotations that made the cast
    // ambiguous between the two overloaded webView selectors.)

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if capacitorDelegate?.webView?(webView, decidePolicyFor: navigationAction, decisionHandler: decisionHandler) == nil {
            decisionHandler(.allow)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        // 5xx on the main document → offline fallback. We cancel the
        // response and swap in the bundled offline page instead of
        // letting Capacitor see it (we've already consumed the
        // decisionHandler with .cancel).
        if navigationResponse.isForMainFrame,
           let httpResp = navigationResponse.response as? HTTPURLResponse,
           httpResp.statusCode >= 500,
           let url = httpResp.url,
           url.absoluteString.hasPrefix(MainViewController.remoteURLString),
           !showingOfflineFallback {
            decisionHandler(.cancel)
            loadBundledOfflinePage()
            return
        }

        if capacitorDelegate?.webView?(webView, decidePolicyFor: navigationResponse, decisionHandler: decisionHandler) == nil {
            decisionHandler(.allow)
        }
    }

    func webView(_ webView: WKWebView, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        if capacitorDelegate?.webView?(webView, didReceive: challenge, completionHandler: completionHandler) == nil {
            completionHandler(.performDefaultHandling, nil)
        }
    }
}
