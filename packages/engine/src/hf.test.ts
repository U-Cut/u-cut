import { describe, expect, it } from "vitest";
import { hfArguments, offlineEnv } from "./hf.ts";

describe("hfArguments", () => {
  it("allows local commands", () => {
    expect(hfArguments(["render", "project", "--sdr"])).toEqual(["render", "project", "--sdr"]);
  });

  it.each(["publish", "cloud", "feedback", "auth", "lambda"])("refuses %s", (command) => {
    expect(() => hfArguments([command])).toThrow(
      `doesn't use the HyperFrames command "${command}"`,
    );
  });

  it("refuses uploading audio for analysis", () => {
    expect(() => hfArguments(["audio", "a.wav", "--quality", "best"])).toThrow("never uploads");
    expect(() => hfArguments(["audio", "a.wav", "--quality=best"])).toThrow("never uploads");
  });

  it("refuses online transcription", () => {
    expect(() => hfArguments(["transcribe", "a.wav", "--engine", "heygen"])).toThrow(
      "never sends speech",
    );
  });

  it("turns off telemetry and update checks", () => {
    expect(offlineEnv.HYPERFRAMES_NO_TELEMETRY).toBe("1");
    expect(offlineEnv.HYPERFRAMES_NO_UPDATE_CHECK).toBe("1");
    expect(offlineEnv.DO_NOT_TRACK).toBe("1");
  });
});
