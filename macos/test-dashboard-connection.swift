import Foundation

@main
struct DashboardConnectionTests {
    static func main() {
        expect(DashboardConnection.dashboardURL.absoluteString == "http://127.0.0.1:9119/", "dashboard URL uses the live local dashboard port")
        expect(DashboardConnection.healthURL.absoluteString == "http://127.0.0.1:9119/api/health", "readiness check uses dashboard health, not BrainBook health")
        expect(DashboardConnection.allowsNavigation(URL(string: "http://127.0.0.1:9119/chat")!, in: .hermesDashboard), "Hermes pane can navigate within dashboard origin")
        expect(!DashboardConnection.allowsNavigation(URL(string: "http://127.0.0.1:9119/chat")!, in: .brainBook), "BrainBook pane cannot navigate into privileged dashboard origin")
        expect(!DashboardConnection.allowsNavigation(URL(string: "http://127.0.0.1:4183/")!, in: .hermesDashboard), "Hermes pane cannot navigate into BrainBook origin")
        expect(!DashboardConnection.allowsNavigation(URL(string: "https://example.com/")!, in: .hermesDashboard), "Hermes pane rejects external navigation")
        expect(DashboardConnection.isHealthy(statusCode: 200, body: #"{"ok":true,"auth_required":false}"#), "open dashboard health is accepted")
        expect(!DashboardConnection.isHealthy(statusCode: 200, body: #"{"ok":true,"auth_required":true}"#), "gated dashboard is not exposed without an auth flow")
        expect(!DashboardConnection.isHealthy(statusCode: 503, body: #"{"ok":true,"auth_required":false}"#), "non-200 dashboard health is rejected")
    }

    private static func expect(_ condition: Bool, _ description: String) {
        guard condition else {
            fputs("FAIL \(description)\n", stderr)
            exit(1)
        }
        print("PASS \(description)")
    }
}
