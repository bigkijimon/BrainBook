// BrainBook — idea and task companion for Hermes. Native macOS shell (Apple silicon).
// Starts the bundled Node server on 127.0.0.1:4183, shows BrainBook and the existing Hermes dashboard,
// opens obsidian:// and external links in their own apps, and stops the server on quit.
// Per-user data: ~/Library/Application Support/BrainBook (tasks.json, config.json, paired phones).
import Cocoa
import WebKit

let port = 4183
let baseURL = URL(string: "http://127.0.0.1:\(port)/")!
let healthURL = URL(string: "http://127.0.0.1:\(port)/api/health")!
let hermesURL = DashboardConnection.dashboardURL
let supportDir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("BrainBook")

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

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var webView: WKWebView!
    var hermesView: WKWebView!
    var split: NSSplitView!
    var hermesLoaded = false
    var server: Process?
    var logHandle: FileHandle?
    var terminating = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        let config = WKWebViewConfiguration()
        // Native window chrome: keep the brand clear of the traffic-light buttons.
        let css = ".topbar{padding-left:92px !important}"
        let js = "const s=document.createElement('style');s.textContent='\(css)';document.documentElement.appendChild(s);document.documentElement.classList.add('native-app');"
        // Voice input (src/voice.ts) only when this build declares the microphone/speech usage
        // strings; without them macOS terminates the app on first microphone use.
        let voice = Bundle.main.object(forInfoDictionaryKey: "NSMicrophoneUsageDescription") != nil
            && Bundle.main.object(forInfoDictionaryKey: "NSSpeechRecognitionUsageDescription") != nil
        config.userContentController.addUserScript(WKUserScript(source: "window.brainbookVoice=\(voice);", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        config.userContentController.add(self, name: "hermes")
        config.websiteDataStore = .default()
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.setValue(false, forKey: "drawsBackground")

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1440, height: 920),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                          backing: .buffered, defer: false)
        window.title = "BrainBook"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.backgroundColor = NSColor(red: 0.07, green: 0.02, blue: 0.12, alpha: 1)
        window.minSize = NSSize(width: 900, height: 600)
        hermesView = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        hermesView.navigationDelegate = self
        hermesView.uiDelegate = self
        hermesView.setValue(false, forKey: "drawsBackground")
        split = NSSplitView()
        split.isVertical = true
        split.dividerStyle = .thin
        split.addArrangedSubview(webView)
        split.addArrangedSubview(hermesView)
        // Neither pane may be squeezed to a sliver (2026-09-29: a window resize left the
        // Hermes panel ~20 pt wide and it looked gone). A hidden arranged subview is
        // removed from layout, so these do not apply while ⌘J has the panel closed.
        webView.widthAnchor.constraint(greaterThanOrEqualToConstant: 480).isActive = true
        hermesView.widthAnchor.constraint(greaterThanOrEqualToConstant: 380).isActive = true
        window.contentView = split
        window.center()
        window.setFrameAutosaveName("BrainBookMainWindow")
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        // Hermes panel is open by default (BrainBook is a Hermes companion); ⌘J remembers the choice.
        hermesView.isHidden = true
        let panelOpen = UserDefaults.standard.object(forKey: "hermesPanelOpen") as? Bool ?? true
        if panelOpen { hermesPending = true } else { split.adjustSubviews() }

        webView.loadHTMLString(loadingPage("Starting BrainBook"), baseURL: nil)
        startServerIfNeeded()
    }

    var hermesPending = false

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationWillTerminate(_ notification: Notification) {
        terminating = true
        // Never hang on quit: give the server 2 s to exit, then force it (a stuck file read ignores SIGTERM).
        if let server, server.isRunning {
            server.terminate()
            let deadline = Date().addingTimeInterval(2)
            while server.isRunning && Date() < deadline { usleep(50_000) }
            if server.isRunning { kill(server.processIdentifier, SIGKILL) }
        }
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
            self.stopStaleServer()
            self.launchServer()
            self.waitForServer(attempts: 60)
        }
    }

    // A BrainBook server that holds the port but does not answer (left over from a crash) is ours to stop.
    // Only the pid it recorded is touched, and only if that process is really BrainBook's server.
    func stopStaleServer() {
        let pidFile = supportDir.appendingPathComponent("server.pid")
        guard let text = try? String(contentsOf: pidFile, encoding: .utf8), let pid = Int32(text.trimmingCharacters(in: .whitespacesAndNewlines)), pid > 0 else { return }
        let check = Process()
        check.executableURL = URL(fileURLWithPath: "/bin/ps")
        check.arguments = ["-o", "command=", "-p", String(pid)]
        let pipe = Pipe()
        check.standardOutput = pipe
        guard (try? check.run()) != nil else { return }
        check.waitUntilExit()
        let command = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        guard command.contains("BrainBook.app/Contents/Resources/app/server.mjs") else { return }
        kill(pid, SIGTERM)
        for _ in 0..<20 { usleep(100_000); if kill(pid, 0) != 0 { break } }
        if kill(pid, 0) == 0 { kill(pid, SIGKILL); usleep(300_000) }
    }

    func serverReady() {
        webView.load(URLRequest(url: baseURL))
        if hermesPending { hermesPending = false; setHermesPanel(open: true) }
        else if !hermesView.isHidden { loadHermes() }
    }

    func launchServer() {
        let res = Bundle.main.resourceURL!
        let node = res.appendingPathComponent("node").path
        let appDir = res.appendingPathComponent("app")
        let process = Process()
        process.executableURL = URL(fileURLWithPath: node)
        process.arguments = [appDir.appendingPathComponent("server.mjs").path]
        process.currentDirectoryURL = appDir
        var env = ProcessInfo.processInfo.environment
        env["PORT"] = String(port)
        env["BRAINBOOK_PARENT_PID"] = String(ProcessInfo.processInfo.processIdentifier)
        // One-time move from the app's old name (Aster) so tasks, areas and paired phones carry over.
        let oldDir = supportDir.deletingLastPathComponent().appendingPathComponent("Aster")
        if !FileManager.default.fileExists(atPath: supportDir.path), FileManager.default.fileExists(atPath: oldDir.path) {
            try? FileManager.default.moveItem(at: oldDir, to: supportDir)
        }
        try? FileManager.default.createDirectory(at: supportDir, withIntermediateDirectories: true)
        env["BRAINBOOK_HOME"] = supportDir.path
        // Finder-launched apps get a minimal PATH; the server shells out to python3 / opencode.
        env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:" + (env["PATH"] ?? "")
        process.environment = env

        let logDir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/BrainBook")
        try? FileManager.default.createDirectory(at: logDir, withIntermediateDirectories: true)
        let logURL = logDir.appendingPathComponent("server.log")
        // One previous run survives a restart: over 5 MB, server.log becomes server.log.1.
        let rotatedURL = logDir.appendingPathComponent("server.log.1")
        if let size = (try? FileManager.default.attributesOfItem(atPath: logURL.path))?[.size] as? NSNumber,
           size.int64Value > 5 * 1024 * 1024 {
            try? FileManager.default.removeItem(at: rotatedURL)
            try? FileManager.default.moveItem(at: logURL, to: rotatedURL)
        }
        // O_APPEND creates the file only when missing and never truncates it, so the run that
        // just ended keeps its last lines (a plain createFile emptied it on every launch).
        let fd = open(logURL.path, O_WRONLY | O_CREAT | O_APPEND, 0o644)
        if fd >= 0 {
            let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
            logHandle = handle
            process.standardOutput = handle
            process.standardError = handle
        }
        // Strong capture: the stop line is written even if the app delegate is already gone.
        let childLog = logHandle
        process.terminationHandler = { [weak self] proc in
            let reason: String
            switch proc.terminationReason {
            case .exit: reason = "exit"
            case .uncaughtSignal: reason = "uncaughtSignal"
            @unknown default: reason = "unknown"
            }
            logLine(childLog, "server stopped status=\(proc.terminationStatus) reason=\(reason)")
            DispatchQueue.main.async {
                guard let self, !self.terminating else { return }
                self.webView.loadHTMLString(self.loadingPage("BrainBook server stopped (exit \(proc.terminationStatus)). Log: ~/Library/Logs/BrainBook/server.log — press ⌘R to restart."), baseURL: nil)
            }
        }
        do {
            try process.run()
            server = process
            logLine(childLog, "server started pid=\(process.processIdentifier)")
        } catch {
            webView.loadHTMLString(loadingPage("Could not start server: \(error.localizedDescription)"), baseURL: nil)
        }
    }

    func waitForServer(attempts: Int) {
        isHealthy { [weak self] ok in
            guard let self else { return }
            if ok { self.serverReady(); return }
            guard attempts > 0, self.server?.isRunning == true else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { self.waitForServer(attempts: attempts - 1) }
        }
    }

    @objc func reloadApp(_ sender: Any?) {
        if server?.isRunning == true || server == nil { webView.reload() }
        if server?.isRunning != true { startServerIfNeeded() }
    }

    // MARK: Hermes dashboard panel (reuse the existing loopback service; never start a second Hermes UI)

    func loadHermes() {
        hermesLoaded = true
        var request = URLRequest(url: DashboardConnection.healthURL)
        request.timeoutInterval = 2
        URLSession.shared.dataTask(with: request) { data, response, _ in
            let body = data.flatMap { String(data: $0, encoding: .utf8) }
            let up = DashboardConnection.isHealthy(statusCode: (response as? HTTPURLResponse)?.statusCode, body: body)
            DispatchQueue.main.async {
                if up { self.hermesView.load(URLRequest(url: hermesURL)) }
                else {
                    self.hermesLoaded = false
                    self.hermesView.loadHTMLString(self.loadingPage("The existing Hermes Dashboard is unavailable at 127.0.0.1:9119. BrainBook will not start a duplicate. Start Hermes Dashboard, then press ⌘J twice to retry."), baseURL: nil)
                }
            }
        }.resume()
    }

    func setHermesPanel(open: Bool) {
        if open && !hermesView.isHidden && hermesView.frame.width < 380 {
            // Already open but collapsed: restore a usable width instead of doing nothing.
            split.setPosition(split.bounds.width * 0.52, ofDividerAt: 0)
            return
        }
        guard hermesView.isHidden == open else { return }
        hermesView.isHidden = !open
        UserDefaults.standard.set(open, forKey: "hermesPanelOpen")
        if open {
            if !hermesLoaded { loadHermes() }
            split.adjustSubviews()
            split.setPosition(split.bounds.width * 0.52, ofDividerAt: 0)
        }
    }

    @objc func toggleHermes(_ sender: Any?) {
        let collapsed = !hermesView.isHidden && hermesView.frame.width < 380
        setHermesPanel(open: hermesView.isHidden || collapsed)
        if !hermesView.isHidden { focusTerminal() }
    }

    func focusTerminal() {
        window.makeFirstResponder(hermesView)
        hermesView.evaluateJavaScript("document.querySelector('.xterm-helper-textarea')?.focus()")
    }

    // BrainBook → the existing Hermes dashboard PTY: paste context only; never press Enter or spawn a CLI.
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "hermes", let notePath = message.body as? String, !notePath.isEmpty else { return }
        setHermesPanel(open: true)
        var request = URLRequest(url: URL(string: "http://127.0.0.1:\(port)/api/hermes/idea")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["path": notePath, "target": "dashboard"])
        URLSession.shared.dataTask(with: request) { data, response, _ in
            guard (response as? HTTPURLResponse)?.statusCode == 200,
                  let data,
                  let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let text = payload["prompt"] as? String else {
                DispatchQueue.main.async { self.reportDashboardHandoff(false) }
                return
            }
            DispatchQueue.main.async { self.pasteIntoDashboard(text, attempts: 20) }
        }.resume()
    }

    func pasteIntoDashboard(_ text: String, attempts: Int) {
        guard attempts > 0,
              let encoded = try? JSONSerialization.data(withJSONObject: [text]),
              let json = String(data: encoded, encoding: .utf8) else { return }
        let script = """
        (() => {
          const text = \(json)[0];
          const target = document.querySelector('.xterm-helper-textarea');
          if (!target) return false;
          const clipboard = new DataTransfer();
          clipboard.setData('text/plain', text);
          target.focus();
          target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }));
          return true;
        })()
        """
        hermesView.evaluateJavaScript(script) { result, _ in
            if (result as? Bool) == true { self.reportDashboardHandoff(true); return }
            guard attempts > 1 else { self.reportDashboardHandoff(false); return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { self.pasteIntoDashboard(text, attempts: attempts - 1) }
        }
    }

    func reportDashboardHandoff(_ ok: Bool) {
        let value = ok ? "true" : "false"
        webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('brainbook:hermes-handoff', { detail: { ok: \(value) } }))")
    }

    // MARK: links

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.allow) }
        let surface: DashboardConnection.Surface
        if webView === self.webView { surface = .brainBook }
        else if webView === self.hermesView { surface = .hermesDashboard }
        else { return decisionHandler(.cancel) }
        let local = DashboardConnection.allowsNavigation(url, in: surface)
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
        let safe = message.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
        return """
        <html><head><meta charset="utf-8"><style>html,body{margin:0;background:#12061f}\(loadingCSS)</style></head><body>
        <div id="bb-boot" role="status">\(loadingSVG)<div class="bb-box"><p class="bb-name">BrainBook</p><p class="bb-tag">IDEAS · FOR · HERMES</p><p class="bb-msg">\(safe)</p><div class="bb-bar"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div></div>
        </body></html>
        """
    }


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
        view.addItem(withTitle: "Toggle Hermes Dashboard", action: #selector(toggleHermes(_:)), keyEquivalent: "j")
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
