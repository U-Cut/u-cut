// Generated from packages/schema by `pnpm gen:swift`. Do not edit by hand.

import Foundation

public enum ScalarValue: Codable, Sendable, Equatable {
    case string(String)
    case number(Double)
    case bool(Bool)

    public init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else {
            self = .string(try container.decode(String.self))
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        }
    }
}

public struct MediaItem: Codable, Sendable, Equatable {
    public enum Kind: String, Codable, Sendable, Equatable {
        case photo = "photo"
        case video = "video"
    }

    public struct Gps: Codable, Sendable, Equatable {
        public var lat: Double
        public var lon: Double

        public init(lat: Double, lon: Double) {
            self.lat = lat
            self.lon = lon
        }
    }

    public struct Quality: Codable, Sendable, Equatable {
        public var sharpness: Double?
        public var exposure: Double?
        public var faces: Int?
        public var dupGroup: String?
        public var score: Double?

        public init(sharpness: Double? = nil, exposure: Double? = nil, faces: Int? = nil, dupGroup: String? = nil, score: Double? = nil) {
            self.sharpness = sharpness
            self.exposure = exposure
            self.faces = faces
            self.dupGroup = dupGroup
            self.score = score
        }

        private enum CodingKeys: String, CodingKey {
            case sharpness
            case exposure
            case faces
            case dupGroup
            case score
        }

        public func encode(to encoder: any Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(sharpness, forKey: .sharpness)
            try container.encode(exposure, forKey: .exposure)
            try container.encode(faces, forKey: .faces)
            try container.encode(dupGroup, forKey: .dupGroup)
            try container.encode(score, forKey: .score)
        }
    }

    public struct Focu: Codable, Sendable, Equatable {
        public var x: Double
        public var y: Double

        public init(x: Double, y: Double) {
            self.x = x
            self.y = y
        }
    }

    public struct Label: Codable, Sendable, Equatable {
        public var id: String
        public var score: Double

        public init(id: String, score: Double) {
            self.id = id
            self.score = score
        }
    }

    public var id: String
    public var path: String
    public var kind: Kind
    public var w: Int
    public var h: Int
    public var duration: Double?
    public var takenAt: String?
    public var gps: Gps?
    public var orientation: Int
    public var quality: Quality
    public var focus: Focu?
    public var labels: [Label]
    public var moment: String?

    public init(id: String, path: String, kind: Kind, w: Int, h: Int, duration: Double? = nil, takenAt: String? = nil, gps: Gps? = nil, orientation: Int, quality: Quality, focus: Focu? = nil, labels: [Label], moment: String? = nil) {
        self.id = id
        self.path = path
        self.kind = kind
        self.w = w
        self.h = h
        self.duration = duration
        self.takenAt = takenAt
        self.gps = gps
        self.orientation = orientation
        self.quality = quality
        self.focus = focus
        self.labels = labels
        self.moment = moment
    }

    private enum CodingKeys: String, CodingKey {
        case id
        case path
        case kind
        case w
        case h
        case duration
        case takenAt
        case gps
        case orientation
        case quality
        case focus
        case labels
        case moment
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(path, forKey: .path)
        try container.encode(kind, forKey: .kind)
        try container.encode(w, forKey: .w)
        try container.encode(h, forKey: .h)
        try container.encodeIfPresent(duration, forKey: .duration)
        try container.encodeIfPresent(takenAt, forKey: .takenAt)
        try container.encodeIfPresent(gps, forKey: .gps)
        try container.encode(orientation, forKey: .orientation)
        try container.encode(quality, forKey: .quality)
        try container.encode(focus, forKey: .focus)
        try container.encode(labels, forKey: .labels)
        try container.encode(moment, forKey: .moment)
    }
}

public struct StyleRecipe: Codable, Sendable, Equatable {
    public enum Aspect: String, Codable, Sendable, Equatable {
        case r9x16 = "9:16"
        case r1x1 = "1:1"
        case r16x9 = "16:9"
    }

    public struct CutRhythm: Codable, Sendable, Equatable {
        public var median: Double
        public var p90: Double
        public var onBeat: Bool

        public init(median: Double, p90: Double, onBeat: Bool) {
            self.median = median
            self.p90 = p90
            self.onBeat = onBeat
        }
    }

    public struct Section: Codable, Sendable, Equatable {
        public var name: String
        public var start: Double
        public var end: Double
        public var energy: Double
        public var cut: Double

        public init(name: String, start: Double, end: Double, energy: Double, cut: Double) {
            self.name = name
            self.start = start
            self.end = end
            self.energy = energy
            self.cut = cut
        }
    }

    public struct Text: Codable, Sendable, Equatable {
        public enum Position: String, Codable, Sendable, Equatable {
            case top = "top"
            case upper = "upper"
            case center = "center"
            case lower = "lower"
            case bottom = "bottom"
        }

        public enum Case: String, Codable, Sendable, Equatable {
            case upper = "upper"
            case lower = "lower"
            case title = "title"
            case sentence = "sentence"
        }

        public enum Timing: String, Codable, Sendable, Equatable {
            case word = "word"
            case line = "line"
            case block = "block"
        }

        public var font: String
        public var sizePx: Double
        public var position: Position
        public var `case`: Case
        public var timing: Timing

        public init(font: String, sizePx: Double, position: Position, `case`: Case, timing: Timing) {
            self.font = font
            self.sizePx = sizePx
            self.position = position
            self.case = `case`
            self.timing = timing
        }
    }

    public struct Transition: Codable, Sendable, Equatable {
        public enum Kind: String, Codable, Sendable, Equatable {
            case cut = "cut"
            case whip = "whip"
            case zoom = "zoom"
            case fade = "fade"
        }

        public var type: Kind
        public var share: Double

        public init(type: Kind, share: Double) {
            self.type = type
            self.share = share
        }
    }

    public struct Grade: Codable, Sendable, Equatable {
        public var temp: Double
        public var contrast: Double
        public var sat: Double

        public init(temp: Double, contrast: Double, sat: Double) {
            self.temp = temp
            self.contrast = contrast
            self.sat = sat
        }
    }

    public var aspect: Aspect
    public var duration: Double
    public var bpm: Double?
    public var cutRhythm: CutRhythm
    public var sections: [Section]
    public var text: Text?
    public var transitions: [Transition]
    public var grade: Grade
    public var notes: String

    public init(aspect: Aspect, duration: Double, bpm: Double? = nil, cutRhythm: CutRhythm, sections: [Section], text: Text? = nil, transitions: [Transition], grade: Grade, notes: String) {
        self.aspect = aspect
        self.duration = duration
        self.bpm = bpm
        self.cutRhythm = cutRhythm
        self.sections = sections
        self.text = text
        self.transitions = transitions
        self.grade = grade
        self.notes = notes
    }

    private enum CodingKeys: String, CodingKey {
        case aspect
        case duration
        case bpm
        case cutRhythm
        case sections
        case text
        case transitions
        case grade
        case notes
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(aspect, forKey: .aspect)
        try container.encode(duration, forKey: .duration)
        try container.encodeIfPresent(bpm, forKey: .bpm)
        try container.encode(cutRhythm, forKey: .cutRhythm)
        try container.encode(sections, forKey: .sections)
        try container.encode(text, forKey: .text)
        try container.encode(transitions, forKey: .transitions)
        try container.encode(grade, forKey: .grade)
        try container.encode(notes, forKey: .notes)
    }
}

public struct EditPlan: Codable, Sendable, Equatable {
    public enum Vibe: String, Codable, Sendable, Equatable {
        case chill = "chill"
        case hype = "hype"
        case cinematic = "cinematic"
        case nostalgic = "nostalgic"
    }

    public enum Aspect: String, Codable, Sendable, Equatable {
        case r9x16 = "9:16"
        case r1x1 = "1:1"
        case r16x9 = "16:9"
    }

    public struct Music: Codable, Sendable, Equatable {
        public var src: String
        public var bpm: Double?
        public var start: Double
        public var length: Double
        public var volume: Double?

        public init(src: String, bpm: Double? = nil, start: Double, length: Double, volume: Double? = nil) {
            self.src = src
            self.bpm = bpm
            self.start = start
            self.length = length
            self.volume = volume
        }

        private enum CodingKeys: String, CodingKey {
            case src
            case bpm
            case start
            case length
            case volume
        }

        public func encode(to encoder: any Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(src, forKey: .src)
            try container.encode(bpm, forKey: .bpm)
            try container.encode(start, forKey: .start)
            try container.encode(length, forKey: .length)
            try container.encodeIfPresent(volume, forKey: .volume)
        }
    }

    public struct Grade: Codable, Sendable, Equatable {
        public var temp: Double
        public var contrast: Double
        public var sat: Double

        public init(temp: Double, contrast: Double, sat: Double) {
            self.temp = temp
            self.contrast = contrast
            self.sat = sat
        }
    }

    public struct Voice: Codable, Sendable, Equatable {
        public var src: String
        public var at: Double
        public var vol: Double
        public var text: String

        public init(src: String, at: Double, vol: Double, text: String) {
            self.src = src
            self.at = at
            self.vol = vol
            self.text = text
        }
    }

    public struct Shot: Codable, Sendable, Equatable {
        public struct Motion: Codable, Sendable, Equatable {
            public enum Kind: String, Codable, Sendable, Equatable {
                case none = "none"
                case pushIn = "push-in"
                case pullOut = "pull-out"
                case pan = "pan"
            }

            public struct From: Codable, Sendable, Equatable {
                public var x: Double
                public var y: Double
                public var scale: Double

                public init(x: Double, y: Double, scale: Double) {
                    self.x = x
                    self.y = y
                    self.scale = scale
                }
            }

            public struct To: Codable, Sendable, Equatable {
                public var x: Double
                public var y: Double
                public var scale: Double

                public init(x: Double, y: Double, scale: Double) {
                    self.x = x
                    self.y = y
                    self.scale = scale
                }
            }

            public var type: Kind
            public var from: From
            public var to: To

            public init(type: Kind, from: From, to: To) {
                self.type = type
                self.from = from
                self.to = to
            }
        }

        public struct Crop: Codable, Sendable, Equatable {
            public var x: Double
            public var y: Double
            public var w: Double
            public var h: Double

            public init(x: Double, y: Double, w: Double, h: Double) {
                self.x = x
                self.y = y
                self.w = w
                self.h = h
            }
        }

        public struct Focu: Codable, Sendable, Equatable {
            public var x: Double
            public var y: Double

            public init(x: Double, y: Double) {
                self.x = x
                self.y = y
            }
        }

        public enum Fit: String, Codable, Sendable, Equatable {
            case cover = "cover"
            case contain = "contain"
        }

        public var media: String
        public var `in`: Double
        public var out: Double
        public var start: Double
        public var end: Double
        public var motion: Motion
        public var crop: Crop
        public var focus: Focu
        public var fit: Fit?
        public var keepAudio: Bool?

        public init(media: String, `in`: Double, out: Double, start: Double, end: Double, motion: Motion, crop: Crop, focus: Focu, fit: Fit? = nil, keepAudio: Bool? = nil) {
            self.media = media
            self.in = `in`
            self.out = out
            self.start = start
            self.end = end
            self.motion = motion
            self.crop = crop
            self.focus = focus
            self.fit = fit
            self.keepAudio = keepAudio
        }
    }

    public struct Text: Codable, Sendable, Equatable {
        public var text: String
        public var start: Double
        public var end: Double
        public var style: String

        public init(text: String, start: Double, end: Double, style: String) {
            self.text = text
            self.start = start
            self.end = end
            self.style = style
        }
    }

    public struct Card: Codable, Sendable, Equatable {
        public var title: String
        public var start: Double
        public var end: Double
        public var colour: String
        public var logo: String?

        public init(title: String, start: Double, end: Double, colour: String, logo: String? = nil) {
            self.title = title
            self.start = start
            self.end = end
            self.colour = colour
            self.logo = logo
        }
    }

    public struct TextStyle: Codable, Sendable, Equatable {
        public enum Position: String, Codable, Sendable, Equatable {
            case top = "top"
            case upper = "upper"
            case center = "center"
            case lower = "lower"
            case bottom = "bottom"
        }

        public enum Case: String, Codable, Sendable, Equatable {
            case upper = "upper"
            case lower = "lower"
            case title = "title"
            case sentence = "sentence"
        }

        public var position: Position
        public var `case`: Case
        public var sizePx: Double

        public init(position: Position, `case`: Case, sizePx: Double) {
            self.position = position
            self.case = `case`
            self.sizePx = sizePx
        }
    }

    public struct Transition: Codable, Sendable, Equatable {
        public enum Kind: String, Codable, Sendable, Equatable {
            case cut = "cut"
            case whip = "whip"
            case zoom = "zoom"
            case fade = "fade"
        }

        public var type: Kind
        public var at: Double
        public var duration: Double

        public init(type: Kind, at: Double, duration: Double) {
            self.type = type
            self.at = at
            self.duration = duration
        }
    }

    public struct Sfx: Codable, Sendable, Equatable {
        public var src: String
        public var at: Double
        public var vol: Double

        public init(src: String, at: Double, vol: Double) {
            self.src = src
            self.at = at
            self.vol = vol
        }
    }

    public var schemaVersion: Int
    public var template: String
    public var vibe: Vibe
    public var aspect: Aspect
    public var fps: Int
    public var seed: Int
    public var duration: Double
    public var music: Music
    public var grade: Grade
    public var voice: [Voice]?
    public var shots: [Shot]
    public var texts: [Text]
    public var cards: [Card]?
    public var textStyle: TextStyle?
    public var transitions: [Transition]
    public var sfx: [Sfx]

    public init(schemaVersion: Int, template: String, vibe: Vibe, aspect: Aspect, fps: Int, seed: Int, duration: Double, music: Music, grade: Grade, voice: [Voice]? = nil, shots: [Shot], texts: [Text], cards: [Card]? = nil, textStyle: TextStyle? = nil, transitions: [Transition], sfx: [Sfx]) {
        self.schemaVersion = schemaVersion
        self.template = template
        self.vibe = vibe
        self.aspect = aspect
        self.fps = fps
        self.seed = seed
        self.duration = duration
        self.music = music
        self.grade = grade
        self.voice = voice
        self.shots = shots
        self.texts = texts
        self.cards = cards
        self.textStyle = textStyle
        self.transitions = transitions
        self.sfx = sfx
    }
}

public struct TemplateManifest: Codable, Sendable, Equatable {
    public enum Licence: String, Codable, Sendable, Equatable {
        case Apache20 = "Apache-2.0"
        case MIT = "MIT"
        case CC010 = "CC0-1.0"
        case CCBY40 = "CC-BY-4.0"
        case OFL11 = "OFL-1.1"
    }

    public enum Aspect: String, Codable, Sendable, Equatable {
        case r9x16 = "9:16"
        case r1x1 = "1:1"
        case r16x9 = "16:9"
    }

    public struct DurationRange: Codable, Sendable, Equatable {
        public var min: Double
        public var max: Double

        public init(min: Double, max: Double) {
            self.min = min
            self.max = max
        }
    }

    public struct Section: Codable, Sendable, Equatable {
        public struct Slot: Codable, Sendable, Equatable {
            public var accepts: [String]
            public var count: Int
            public var minDur: Double
            public var maxDur: Double

            public init(accepts: [String], count: Int, minDur: Double, maxDur: Double) {
                self.accepts = accepts
                self.count = count
                self.minDur = minDur
                self.maxDur = maxDur
            }
        }

        public var name: String
        public var slots: [Slot]

        public init(name: String, slots: [Slot]) {
            self.name = name
            self.slots = slots
        }
    }

    public struct Variable: Codable, Sendable, Equatable {
        public enum Kind: String, Codable, Sendable, Equatable {
            case string = "string"
            case number = "number"
            case color = "color"
            case boolean = "boolean"
            case `enum` = "enum"
        }

        public var id: String
        public var type: Kind
        public var label: String
        public var `default`: ScalarValue

        public init(id: String, type: Kind, label: String, `default`: ScalarValue) {
            self.id = id
            self.type = type
            self.label = label
            self.default = `default`
        }
    }

    public enum Vibe: String, Codable, Sendable, Equatable {
        case chill = "chill"
        case hype = "hype"
        case cinematic = "cinematic"
        case nostalgic = "nostalgic"
    }

    public var id: String
    public var name: String
    public var version: String
    public var author: String
    public var licence: Licence
    public var aspects: [Aspect]
    public var durationRange: DurationRange
    public var sections: [Section]
    public var variables: [Variable]
    public var vibes: [Vibe]
    public var preview: String
    public var requires: [String]

    public init(id: String, name: String, version: String, author: String, licence: Licence, aspects: [Aspect], durationRange: DurationRange, sections: [Section], variables: [Variable], vibes: [Vibe], preview: String, requires: [String]) {
        self.id = id
        self.name = name
        self.version = version
        self.author = author
        self.licence = licence
        self.aspects = aspects
        self.durationRange = durationRange
        self.sections = sections
        self.variables = variables
        self.vibes = vibes
        self.preview = preview
        self.requires = requires
    }
}

public struct BeatGrid: Codable, Sendable, Equatable {
    public enum Source: String, Codable, Sendable, Equatable {
        case detected = "detected"
        case even = "even"
    }

    public var bpm: Double?
    public var times: [Double]
    public var source: Source

    public init(bpm: Double? = nil, times: [Double], source: Source) {
        self.bpm = bpm
        self.times = times
        self.source = source
    }

    private enum CodingKeys: String, CodingKey {
        case bpm
        case times
        case source
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(bpm, forKey: .bpm)
        try container.encode(times, forKey: .times)
        try container.encode(source, forKey: .source)
    }
}
