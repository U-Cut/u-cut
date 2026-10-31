// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "UCut",
    platforms: [.macOS(.v15)],
    products: [
        .executable(name: "UCut", targets: ["UCut"]),
        .executable(name: "ucut-vision", targets: ["ucut-vision"]),
    ],
    targets: [
        .target(name: "UCutSchema"),
        .executableTarget(name: "UCut", dependencies: ["UCutSchema"]),
        .executableTarget(name: "ucut-vision"),
        .executableTarget(name: "schema-roundtrip", dependencies: ["UCutSchema"]),
    ]
)
