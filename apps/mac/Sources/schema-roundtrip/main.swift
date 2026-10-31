import Foundation
import UCutSchema

// Decodes a JSON file as the named type and prints it back, so the TypeScript tests
// can prove that the generated Swift types lose nothing.

func roundTrip<T: Codable>(_ type: T.Type, _ data: Data) throws -> Data {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    return try encoder.encode(JSONDecoder().decode(type, from: data))
}

let arguments = CommandLine.arguments
guard arguments.count == 3 else {
    FileHandle.standardError.write(Data("usage: schema-roundtrip <type> <file>\n".utf8))
    exit(2)
}

let input = try Data(contentsOf: URL(fileURLWithPath: arguments[2]))
let output: Data
switch arguments[1] {
case "MediaItem": output = try roundTrip(MediaItem.self, input)
case "StyleRecipe": output = try roundTrip(StyleRecipe.self, input)
case "EditPlan": output = try roundTrip(EditPlan.self, input)
case "TemplateManifest": output = try roundTrip(TemplateManifest.self, input)
case "BeatGrid": output = try roundTrip(BeatGrid.self, input)
default:
    FileHandle.standardError.write(Data("unknown type: \(arguments[1])\n".utf8))
    exit(2)
}
FileHandle.standardOutput.write(output)
