import { describe, expect, it } from "vitest";
import { SDK_CORE_VERSION } from "./index.js";

describe("sdk-core", () => {
  it("exposes a version string", () => {
    expect(SDK_CORE_VERSION).toBe("0.0.0");
  });
});
