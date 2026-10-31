import CoreGraphics
import Foundation
import ImageIO
import Vision

// On-device photo analysis. Reads one image path per line on stdin and writes one JSON line per
// image on stdout, in any order. Everything here is built into macOS: nothing is downloaded.

let version = "0.1.0"
let concurrency = 4

struct Label: Encodable, Sendable {
    let id: String
    let score: Float
}

struct Result: Encodable, Sendable {
    let path: String
    var error: String?
    var labels: [Label]?
    var print: String?
    var faces: Int?
    /// The share of the frame taken up by the largest face.
    var faceArea: Double?
    var score: Float?
    var utility: Bool?
    var focus: [Double]?
    var sharpness: Double?
    var exposure: Double?
}

/// Sharpness is the variance of a Laplacian filter, and exposure is the mean brightness.
func measure(_ url: URL) -> (sharpness: Double, exposure: Double)? {
    let size = 192
    let options = [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: size,
    ] as CFDictionary
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
        let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options)
    else { return nil }
    let width = image.width
    let height = image.height
    var pixels = [UInt8](repeating: 0, count: width * height)
    let drawn = pixels.withUnsafeMutableBytes { buffer -> Bool in
        guard
            let context = CGContext(
                data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8,
                bytesPerRow: width, space: CGColorSpaceCreateDeviceGray(),
                bitmapInfo: CGImageAlphaInfo.none.rawValue)
        else { return false }
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        return true
    }
    guard drawn, width > 2, height > 2 else { return nil }

    var total = 0.0
    var squares = 0.0
    var brightness = 0.0
    var count = 0.0
    for y in 1..<(height - 1) {
        for x in 1..<(width - 1) {
            let index = y * width + x
            let centre = Double(pixels[index])
            let sum =
                Double(pixels[index - 1]) + Double(pixels[index + 1])
                + Double(pixels[index - width]) + Double(pixels[index + width])
            let laplacian = sum - 4 * centre
            total += laplacian
            squares += laplacian * laplacian
            brightness += centre
            count += 1
        }
    }
    let mean = total / count
    return (squares / count - mean * mean, brightness / count / 255)
}

func analyse(_ path: String) async -> Result {
    let url = URL(fileURLWithPath: path)
    var result = Result(path: path)
    do {
        let classes = try await ClassifyImageRequest().perform(on: url)
        result.labels =
            classes
            .filter { $0.confidence >= 0.02 }
            .sorted { $0.confidence > $1.confidence }
            .prefix(12)
            .map { Label(id: $0.identifier, score: ($0.confidence * 1000).rounded() / 1000) }

        let feature = try await GenerateImageFeaturePrintRequest().perform(on: url)
        result.print = feature.data.base64EncodedString()

        // Declared optional because the result's type differs between macOS SDKs.
        let aesthetics: ImageAestheticsScoresObservation? =
            try await CalculateImageAestheticsScoresRequest().perform(on: url)
        result.score = aesthetics?.overallScore
        result.utility = aesthetics?.isUtility

        let faces = try await DetectFaceRectanglesRequest().perform(on: url)
        result.faces = faces.count
        let largest = faces.map { Double($0.boundingBox.width * $0.boundingBox.height) }.max() ?? 0
        result.faceArea = (largest * 1000).rounded() / 1000

        let saliency: SaliencyImageObservation? =
            try await GenerateAttentionBasedSaliencyImageRequest().perform(on: url)
        if let object = saliency?.salientObjects.first {
            let box = object.boundingBox.cgRect
            // Vision's origin is bottom-left. Compositions use top-left.
            result.focus = [Double(box.midX), 1 - Double(box.midY)]
        }

        if let measured = measure(url) {
            result.sharpness = (measured.sharpness * 10).rounded() / 10
            result.exposure = (measured.exposure * 1000).rounded() / 1000
        }
    } catch {
        result.error = String(describing: error)
    }
    return result
}

/// Lines can be longer than a pipe's atomic write, so one writer keeps them whole.
actor Output {
    func write(_ result: Result) {
        guard var line = try? JSONEncoder().encode(result) else { return }
        line.append(0x0A)
        FileHandle.standardOutput.write(line)
    }
}

func readPaths() -> AsyncStream<String> {
    AsyncStream { continuation in
        Thread.detachNewThread {
            while let line = readLine() {
                if !line.isEmpty { continuation.yield(line) }
            }
            continuation.finish()
        }
    }
}

/// Each result is written as soon as it's ready, so this can run for as long as stdin stays open.
func analyseAll() async {
    let output = Output()
    await withTaskGroup(of: Void.self) { group in
        var running = 0
        for await path in readPaths() {
            if running >= concurrency {
                await group.next()
                running -= 1
            }
            group.addTask { await output.write(await analyse(path)) }
            running += 1
        }
    }
}

switch CommandLine.arguments.dropFirst().first {
case "--version":
    print(#"{"name":"ucut-vision","version":"\#(version)"}"#)
case "analyze":
    await analyseAll()
default:
    FileHandle.standardError.write(Data("usage: ucut-vision analyze < paths\n".utf8))
    exit(2)
}
