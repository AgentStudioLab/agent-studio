import { describe, expect, it } from "bun:test";
import {
  base64UrlEncode,
  createPkcePair,
  randomBase64Url,
  sha256Base64Url,
} from "./pkce";

describe("pkce helpers", () => {
  it("encodes base64url without padding", () => {
    expect(base64UrlEncode(new Uint8Array([251, 255, 255]))).toBe("-___");
    expect(base64UrlEncode(new Uint8Array([1, 2]))).toBe("AQI");
  });

  it("creates random base64url state without padding", () => {
    const value = randomBase64Url();

    expect(value).toHaveLength(43);
    expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("creates a SHA-256 challenge", async () => {
    const challenge = await sha256Base64Url("abc");

    expect(challenge).toBe("ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0");
  });

  it("creates verifier and challenge pair", async () => {
    const pair = await createPkcePair();

    expect(pair.verifier).toHaveLength(64);
    expect(pair.verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(pair.challenge).toBe(await sha256Base64Url(pair.verifier));
  });
});
