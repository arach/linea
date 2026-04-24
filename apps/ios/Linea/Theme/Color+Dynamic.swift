import SwiftUI
import UIKit

extension Color {
    /// Build a dynamic SwiftUI color that resolves against the current `UITraitCollection`.
    /// Both inputs should themselves be concrete colours — this is what lets us write a
    /// single `palette.ink` token and still respect light/dark automatically.
    init(light: Color, dark: Color) {
        self = Color(uiColor: UIColor { trait in
            switch trait.userInterfaceStyle {
            case .dark: return UIColor(dark)
            default:    return UIColor(light)
            }
        })
    }
}
