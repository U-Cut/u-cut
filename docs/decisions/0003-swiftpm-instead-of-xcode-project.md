# 0003. The Mac app is a Swift package, not an Xcode project

Status: accepted. Replaces the "Xcode project" wording in the brief's §9 and Phase 0.

## Context

The owner's Mac has the Command Line Tools but not Xcode. We confirmed that SwiftUI, WebKit and Vision (including `ClassifyImageRequest`) compile and run with `swift build` alone on macOS 26.5. An `.xcodeproj` would be a generated file that this machine can't open and that merges badly.

`swift test` does not work without Xcode: the `Testing` module isn't in the Command Line Tools.

## Decision

- `apps/mac` is a Swift package with three executables and one library: `UCut`, `ucut-vision`, `schema-roundtrip` and `UCutSchema`.
- `scripts/bundle-app.sh` wraps the `UCut` binary into `dist/U-Cut.app` with an `Info.plist`.
- Generated Swift types are proved by `schema-roundtrip`, not by XCTest. It decodes JSON produced by the TypeScript fixtures and re-encodes it, then TypeScript validates the result. This runs everywhere and tests the real contract between the two languages.

## Consequences

Contributors need no Xcode to build. Anyone with Xcode can still open `Package.swift` directly. Notarised releases in Phase 7 will need `codesign` and `notarytool`, which come with Xcode on the CI runners.
