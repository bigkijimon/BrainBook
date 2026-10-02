import Foundation

enum DashboardConnection {
    enum Surface {
        case brainBook
        case hermesDashboard
    }

    static let dashboardURL = URL(string: "http://127.0.0.1:9119/")!
    static let healthURL = URL(string: "http://127.0.0.1:9119/api/health")!

    static func allowsNavigation(_ url: URL, in surface: Surface) -> Bool {
        guard url.scheme == "http", url.host == "127.0.0.1" else { return false }
        switch surface {
        case .brainBook:
            return url.port == 4183
        case .hermesDashboard:
            return url.port == 9119
        }
    }

    static func isHealthy(statusCode: Int?, body: String?) -> Bool {
        guard statusCode == 200, let body, let data = body.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              json["ok"] as? Bool == true else { return false }
        return json["auth_required"] as? Bool == false
    }
}
