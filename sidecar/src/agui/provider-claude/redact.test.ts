import { describe, expect, it } from "bun:test";
import { redactSecrets } from "./redact";

describe("redactSecrets", () => {
  it("masks long alphanumeric values after = or :", () => {
    expect(redactSecrets("export API_KEY=sk-abcdefghijklmnop12345"))
      .toBe("export API_KEY=***");
    expect(redactSecrets("token: tk-zzzzzzzzzzzzzzzzzzzzzzzz"))
      .toBe("token: ***");
  });

  it("does not mask short values", () => {
    expect(redactSecrets("port=8080")).toBe("port=8080");
  });

  it("masks string fields whose key looks sensitive", () => {
    const out = redactSecrets({ apiKey: "anything", port: 8080 }) as Record<string, unknown>;
    expect(out.apiKey).toBe("***");
    expect(out.port).toBe(8080);
  });

  it("recurses into nested objects + arrays", () => {
    const input = {
      cmd: "curl -H 'Authorization: Bearer tok-xyzabcdefghijklmnopqrst' x",
      env: [{ password: "secret123456789012345" }],
    };
    const out = redactSecrets(input) as { cmd: string; env: Array<{ password: string }> };
    expect(out.cmd).toContain("Bearer ***");
    expect(out.env[0]!.password).toBe("***");
  });

  it("passes numbers / booleans / null through", () => {
    expect(redactSecrets(42)).toBe(42);
    expect(redactSecrets(true)).toBe(true);
    expect(redactSecrets(null)).toBe(null);
  });
});
