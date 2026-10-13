// BrainBook — idea and task companion for Hermes. Native macOS shell (Apple silicon).
// Connects to the launchd-managed Node server on 127.0.0.1:4183, shows BrainBook.
// Per-user data: ~/Library/Application Support/BrainBook (tasks.json, config.json, paired phones).
import Cocoa
import WebKit

let port = 4183
let baseURL = URL(string: "http://127.0.0.1:\(port)/")!
let healthURL = URL(string: "http://127.0.0.1:\(port)/api/health")!
let supportDir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("BrainBook")
// One place decides where the server log lives, so the rotation, the child process and the
// "where to look" message can never disagree. BRAINBOOK_LOG_DIR exists for test runs that
// must keep their evidence inside the repository (scripts/test-server-log.mjs).
let logDirURL: URL = {
    let override = ProcessInfo.processInfo.environment["BRAINBOOK_LOG_DIR"]
    if let override, !override.isEmpty { return URL(fileURLWithPath: override) }
    return FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/BrainBook")
}()
let logURL = logDirURL.appendingPathComponent("server.log")

// One timestamped line into the server log. Both the start and the stop reason go through
// here: the 2026-10-02 "server stopped" had no cause left behind because the reason only
// ever appeared on screen. Standalone (not a method) so the termination queue can write it
// even while the app delegate is being torn down.
func logLine(_ handle: FileHandle?, _ text: String) {
    guard let handle else { return }
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
    try? handle.write(contentsOf: Data("\(formatter.string(from: Date())) \(text)\n".utf8))
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var terminating = false

    // Only the signals a Node server actually dies from; anything else keeps its number.
    static let signalNames: [Int: String] = [
        1: "SIGHUP", 2: "SIGINT", 3: "SIGQUIT", 4: "SIGILL", 6: "SIGABRT", 8: "SIGFPE",
        9: "SIGKILL", 11: "SIGSEGV", 13: "SIGPIPE", 14: "SIGALRM", 15: "SIGTERM",
        24: "SIGXCPU", 25: "SIGXFSZ",
    ]

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        let config = WKWebViewConfiguration()
        // Native window chrome: keep the brand clear of the traffic-light buttons.
        let css = ".topbar{padding-left:20px !important}"
        let js = "const s=document.createElement('style');s.textContent='\(css)';document.documentElement.appendChild(s);document.documentElement.classList.add('native-app');"
        // Voice input (src/voice.ts) only when this build declares the microphone/speech usage
        // strings; without them macOS terminates the app on first microphone use.
        let voice = Bundle.main.object(forInfoDictionaryKey: "NSMicrophoneUsageDescription") != nil
            && Bundle.main.object(forInfoDictionaryKey: "NSSpeechRecognitionUsageDescription") != nil
        config.userContentController.addUserScript(WKUserScript(source: "window.brainbookVoice=\(voice);", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        config.websiteDataStore = .default()
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.setValue(false, forKey: "drawsBackground")

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1440, height: 920),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "BrainBook"
        window.titleVisibility = .visible
        window.titlebarAppearsTransparent = false
        window.isMovable = true
        window.backgroundColor = NSColor(red: 0.07, green: 0.02, blue: 0.12, alpha: 1)
        window.minSize = NSSize(width: 900, height: 600)
        window.contentView = webView
        window.center()
        window.setFrameAutosaveName("BrainBookMainWindow")
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        webView.loadHTMLString(loadingPage("Starting BrainBook"), baseURL: nil)
        startServerIfNeeded()
    }


    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationWillTerminate(_ notification: Notification) {
        terminating = true
        // Server is now managed by launchd (com.bigkiji.brainbookserver).
        // Do NOT kill it — the phone must still be able to connect after the Mac app quits.
    }

    // MARK: server

    func isHealthy(_ done: @escaping (Bool) -> Void) {
        var request = URLRequest(url: healthURL)
        request.timeoutInterval = 1
        URLSession.shared.dataTask(with: request) { data, response, _ in
            let ok = (response as? HTTPURLResponse)?.statusCode == 200
                && String(data: data ?? Data(), encoding: .utf8)?.contains("brainbook") == true
            DispatchQueue.main.async { done(ok) }
        }.resume()
    }

    func startServerIfNeeded() {
        isHealthy { [weak self] ok in
            guard let self else { return }
            if ok { self.serverReady(); return }
            // Server not healthy — ask launchd to start it via kickstart.
            self.kickstartLaunchdServer()
            self.waitForServer(attempts: 60)
        }
    }

    func kickstartLaunchdServer() {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/bin/launchctl")
        task.arguments = ["kickstart", "-k", "gui/\(getuid())/com.bigkiji.brainbookserver"]
        do {
            try task.run()
            task.waitUntilExit()
            logLine(nil, "launchctl kickstart sent for com.bigkiji.brainbookserver (status=\(task.terminationStatus))")
        } catch {
            logLine(nil, "launchctl kickstart failed: \(error)")
        }
    }

    func serverReady() {
        webView.load(URLRequest(url: baseURL))
    }

    func waitForServer(attempts: Int) {
        isHealthy { [weak self] ok in
            guard let self else { return }
            if ok { self.serverReady(); return }
            guard attempts > 0 else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { self.waitForServer(attempts: attempts - 1) }
        }
    }

    @objc func reloadApp(_ sender: Any?) {
        if serverRunning() { webView.reload() }
        if !serverRunning() { startServerIfNeeded() }
    }

    // Best-effort check: ping /api/health to see if the launchd server is alive.
    private func serverRunning() -> Bool {
        var ok = false
        let semaphore = DispatchSemaphore(value: 0)
        isHealthy { result in
            ok = result
            semaphore.signal()
        }
        _ = semaphore.wait(timeout: .now() + 2)
        return ok
    }

    // MARK: links

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.allow) }
        let local = webView === self.webView && DashboardConnection.allowsNavigation(url, in: .brainBook)
        if local || url.scheme == "about" || url.scheme == "data" { return decisionHandler(.allow) }
        NSWorkspace.shared.open(url)
        decisionHandler(.cancel)
    }

    // target="_blank" links (Obsidian deep links, Morning board) open in their own app.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { NSWorkspace.shared.open(url) }
        return nil
    }

    // Microphone for voice input: only the BrainBook pane on this Mac's own server; nothing else.
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        let local = webView === self.webView && type == .microphone && ["127.0.0.1", "localhost"].contains(origin.host)
        decisionHandler(local ? .grant : .deny)
    }

    // Same boot animation as the web page (macos/loading.css + loading-svg.html, copied into Resources).
    lazy var loadingCSS: String = (try? String(contentsOf: Bundle.main.url(forResource: "loading", withExtension: "css")!, encoding: .utf8)) ?? ""
    lazy var loadingSVG: String = (try? String(contentsOf: Bundle.main.url(forResource: "loading-svg", withExtension: "html")!, encoding: .utf8)) ?? ""
    func loadingPage(_ message: String) -> String {
        let safe = message.replacingOccurrences(of: "&", with: "&").replacingOccurrences(of: "<", with: "<")
        return """
        <html><head><meta charset="utf-8"><style>html,body{margin:0;background:#12061f}\(loadingCSS)</style></head><body>
        <div id="bb-boot" role="status">\(loadingSVG)<div class="bb-box"><p class="bb-name">BrainBook</p><p class="bb-tag">IDEAS · FOR · HERMES</p><p class="bb-msg">\(safe)</p><div class="bb-bar"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div></div>
        </body></html>
        """
    }


    // MARK: navigation

    func navigate(_ route: String) {
        webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('brainbook:navigate', { detail: '\(route)' }))")
    }
    @objc func showHome(_ sender: Any?) { navigate("home") }
    @objc func showIdeas(_ sender: Any?) { navigate("ideas") }
    @objc func showAgents(_ sender: Any?) { navigate("agents") }
    @objc func showTasks(_ sender: Any?) { navigate("tasks") }

    // MARK: menu

    func buildMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem(); main.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About BrainBook", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide BrainBook", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "Quit BrainBook", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu

        let editItem = NSMenuItem(); main.addItem(editItem)
        let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        edit.addItem(.separator())
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit

        let viewItem = NSMenuItem(); main.addItem(viewItem)
        let view = NSMenu(title: "View")
        view.addItem(withTitle: "Reload", action: #selector(reloadApp(_:)), keyEquivalent: "r")
        view.addItem(withTitle: "Home", action: #selector(showHome(_:)), keyEquivalent: "1")
        view.addItem(withTitle: "Ideas", action: #selector(showIdeas(_:)), keyEquivalent: "2")
        view.addItem(withTitle: "Agents", action: #selector(showAgents(_:)), keyEquivalent: "3")
        view.addItem(withTitle: "Tasks", action: #selector(showTasks(_:)), keyEquivalent: "4")
        view.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        viewItem.submenu = view

        let windowItem = NSMenuItem(); main.addItem(windowItem)
        let win = NSMenu(title: "Window")
        win.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        win.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        windowItem.submenu = win
        NSApp.windowsMenu = win
        NSApp.mainMenu = main
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()