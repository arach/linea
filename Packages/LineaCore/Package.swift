// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "LineaCore",
    platforms: [
        .iOS(.v18),
        .macOS(.v15)
    ],
    products: [
        .library(
            name: "LineaCore",
            targets: ["LineaCore"]
        )
    ],
    targets: [
        .target(
            name: "LineaCore"
        )
    ]
)
