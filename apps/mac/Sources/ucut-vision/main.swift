import Foundation

let version = "0.0.0"

guard CommandLine.arguments.dropFirst().first == "--version" else {
    FileHandle.standardError.write(Data("ucut-vision has no commands yet. Try --version.\n".utf8))
    exit(1)
}
print(#"{"name":"ucut-vision","version":"\#(version)"}"#)
