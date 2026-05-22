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

  it("does NOT mask innocuous fields whose names contain a secret substring", () => {
    const out = redactSecrets({
      secretary_email: "alice@example.com",
      tokenizer_config: { vocab_size: 50000 },
      password_policy_url: "https://example.com/policy",
    }) as Record<string, unknown>;
    expect(out.secretary_email).toBe("alice@example.com");
    expect(out.tokenizer_config).toEqual({ vocab_size: 50000 });
    expect(out.password_policy_url).toBe("https://example.com/policy");
  });

  it("masks AWS-style and private key field names", () => {
    const out = redactSecrets({
      aws_access_key_id: "AKIAIOSFODNN7EXAMPLE",
      aws_secret_access_key: "abc/+abc/+abc/+abc/+abc/",
      private_key: "-----BEGIN RSA PRIVATE KEY-----",
      bearer: "tk-1234",
    }) as Record<string, unknown>;
    expect(out.aws_access_key_id).toBe("***");
    expect(out.aws_secret_access_key).toBe("***");
    expect(out.private_key).toBe("***");
    expect(out.bearer).toBe("***");
  });
});
