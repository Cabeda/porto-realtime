import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "@/lib/logger";

describe("logger", () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, "log").mockImplementation(() => {}),
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs in development mode", () => {
    vi.stubEnv("NODE_ENV", "development");
    logger.log("test message");
    expect(consoleSpy.log).toHaveBeenCalledWith("test message");
    vi.unstubAllEnvs();
  });

  it("does not log in production mode", () => {
    vi.stubEnv("NODE_ENV", "production");
    logger.log("test message");
    expect(consoleSpy.log).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("always logs errors regardless of environment", () => {
    vi.stubEnv("NODE_ENV", "production");
    logger.error("error message");
    expect(consoleSpy.error).toHaveBeenCalledWith("error message");
    vi.unstubAllEnvs();
  });

  it("warns in development mode", () => {
    vi.stubEnv("NODE_ENV", "development");
    logger.warn("warning message");
    expect(consoleSpy.warn).toHaveBeenCalledWith("warning message");
    vi.unstubAllEnvs();
  });

  it("does not warn in production mode", () => {
    vi.stubEnv("NODE_ENV", "production");
    logger.warn("warning message");
    expect(consoleSpy.warn).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("passes multiple arguments", () => {
    vi.stubEnv("NODE_ENV", "development");
    logger.log("msg", { key: "value" }, 42);
    expect(consoleSpy.log).toHaveBeenCalledWith("msg", { key: "value" }, 42);
    vi.unstubAllEnvs();
  });
});
