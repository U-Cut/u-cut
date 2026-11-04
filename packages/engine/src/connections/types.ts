/** What a connection can do for a reel. */
export type Task = "write" | "voice" | "listen";

export type ServiceId = "claude" | "elevenlabs" | "deepgram" | "openai" | "voicestudio";
export type BuiltIn = "rules" | "kokoro" | "whisper";
export type Choice = ServiceId | BuiltIn;

export interface Choices {
  write: "rules" | "claude";
  voice: "kokoro" | "voicestudio" | "elevenlabs" | "deepgram";
  listen: "whisper" | "voicestudio" | "deepgram" | "elevenlabs" | "openai";
}

export interface Voice {
  id: string;
  name: string;
  /** Accent, gender or style, when the service says. */
  detail?: string;
}

/** Sound from a service, before U-Cut turns it into its own WAV. */
export interface Spoken {
  data: Uint8Array;
  extension: string;
}

/** A recording's sound, sent to be written down. */
export interface Heard {
  audio: Uint8Array;
  /** Names and words to listen for, such as the product's name. */
  hints: string[];
  signal?: AbortSignal;
}
