import { describe, expect, it } from "bun:test";
import { detectAudioToolStatus } from "./audioToolStatus";

describe("detectAudioToolStatus", () => {
  it("marks command-line tools ready when found in PATH", () => {
    const status = detectAudioToolStatus({
      pathEnv: "/bin:/usr/bin",
      exists: (path) => path.endsWith("/ffmpeg"),
      executableNames: ["ffmpeg"],
    });

    expect(status.ffmpeg).toBe("ready");
  });

  it("keeps optional model runners unconfigured when no command is present", () => {
    const status = detectAudioToolStatus({
      pathEnv: "",
      exists: () => false,
      executableNames: [],
    });

    expect(status.whisper).toBe("missing");
    expect(status.whisperx).toBe("missing");
    expect(status.chattts).toBe("unconfigured");
    expect(status.fishSpeech).toBe("unconfigured");
  });
});
