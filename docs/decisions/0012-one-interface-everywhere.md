# 0012. One web interface for the browser and the Mac app

Status: accepted. Replaces the SwiftUI screens in the brief's §6.

## Context

The brief describes a SwiftUI app. The owner then asked for U-Cut to run in a web browser or anywhere local, as well as on a Mac. Building that twice would mean two interfaces to design, test and keep in step, for a small open-source project.

## Decision

The interface is one React app in `apps/web`, served by `ucut serve`. The Mac app is a thin native shell: a window with a `WKWebView`, the Mac's own open and save panels, and the engine's lifecycle.

## Consequences

- Every interface change reaches every platform at once, and contributors need no Swift.
- The Mac app gives up some native controls. We keep it feeling native with the system font, a hidden title bar and real file panels.
- If the Mac app ever needs something a web view can't do, it can grow native screens one at a time.
