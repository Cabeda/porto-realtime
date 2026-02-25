import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "@/lib/logger";

describe("logger", () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    info: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, "log").mockImplementation(() => {}),
      info: vi.spyOn(console, "info").mockImplementation(() => {}),
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

  it("logs on server side in production (typeof window === 'undefined')", () => {
    // Vitest runs in Node.js where typeof window === "undefined" (server-side)
    // The logger should always log server-side, even in production
    vi.stubEnv("NODE_ENV", "production");
    logger.log("server log");
    expect(consoleSpy.log).toHaveBeenCalledWith("server log");
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

  it("warns on server side in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    logger.warn("server warning");
    expect(consoleSpy.warn).toHaveBeenCalledWith("server warning");
    vi.unstubAllEnvs();
  });

  it("supports info level", () => {
    vi.stubEnv("NODE_ENV", "development");
    logger.info("info message");
    expect(consoleSpy.info).toHaveBeenCalledWith("info message");
    vi.unstubAllEnvs();
  });

  it("passes multiple arguments", () => {
    vi.stubEnv("NODE_ENV", "development");
    logger.log("msg", { key: "value" }, 42);
    expect(consoleSpy.log).toHaveBeenCalledWith("msg", { key: "value" }, 42);
    vi.unstubAllEnvs();
  });
});
