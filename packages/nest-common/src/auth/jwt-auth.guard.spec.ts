import type { ExecutionContext } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import { AppError } from "../errors/app-error";
import type { AuthUser } from "./auth.types";
import { JwtAuthGuard, OptionalJwtAuthGuard } from "./jwt-auth.guard";

const SECRET = "test-secret-at-least-16";
const jwt = new JwtService({ secret: SECRET });
const jwtGuard = new JwtAuthGuard(jwt);
const optionalGuard = new OptionalJwtAuthGuard(jwt);

type FakeRequest = { headers: { authorization?: string }; user?: AuthUser };

const requestWith = (authorization?: string): FakeRequest => ({ headers: authorization === undefined ? {} : { authorization } });
const contextFor = (req: FakeRequest) => ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;
const tokenFor = (sub: string, secret = SECRET) => new JwtService({ secret }).sign({ sub });

function unauthorized(run: () => unknown): { code: string; status: number; message: string } {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    const { code, status, message } = error as AppError;
    return { code, status, message };
  }
  throw new Error("expected the guard to reject the request");
}

describe("JwtAuthGuard", () => {
  it("sets req.user with a lower-cased address from a mixed-case sub", () => {
    const req = requestWith(`Bearer ${tokenFor("0xAbCdEf0123456789aBcDeF0123456789AbCdEf01")}`);
    expect(jwtGuard.canActivate(contextFor(req))).toBe(true);
    expect(req.user).toEqual({ address: "0xabcdef0123456789abcdef0123456789abcdef01" });
  });

  it("accepts the bearer scheme case-insensitively", () => {
    const req = requestWith(`bearer ${tokenFor("0xAA")}`);
    expect(jwtGuard.canActivate(contextFor(req))).toBe(true);
    expect(req.user).toEqual({ address: "0xaa" });
  });

  it("rejects a request without an Authorization header", () => {
    expect(unauthorized(() => jwtGuard.canActivate(contextFor(requestWith())))).toEqual({
      code: "UNAUTHORIZED",
      status: 401,
      message: "Missing bearer token",
    });
  });

  it("rejects a non-bearer scheme as a missing token", () => {
    expect(unauthorized(() => jwtGuard.canActivate(contextFor(requestWith("Basic dXNlcjpwYXNz")))).message).toBe("Missing bearer token");
  });

  it("rejects a bearer scheme with an empty token as invalid", () => {
    expect(unauthorized(() => jwtGuard.canActivate(contextFor(requestWith("Bearer "))))).toEqual({
      code: "UNAUTHORIZED",
      status: 401,
      message: "Invalid or expired token",
    });
  });

  it("rejects a token signed with another secret", () => {
    const req = requestWith(`Bearer ${tokenFor("0xAA", "another-secret-at-least-16")}`);
    expect(unauthorized(() => jwtGuard.canActivate(contextFor(req)))).toEqual({
      code: "UNAUTHORIZED",
      status: 401,
      message: "Invalid or expired token",
    });
    expect(req.user).toBeUndefined();
  });
});

describe("OptionalJwtAuthGuard", () => {
  it("lets anonymous requests through without a user", () => {
    const req = requestWith();
    expect(optionalGuard.canActivate(contextFor(req))).toBe(true);
    expect(req.user).toBeUndefined();
  });

  it("sets req.user when a valid token is present", () => {
    const req = requestWith(`Bearer ${tokenFor("0xAA")}`);
    expect(optionalGuard.canActivate(contextFor(req))).toBe(true);
    expect(req.user).toEqual({ address: "0xaa" });
  });

  it("rejects a bearer scheme with an empty token instead of treating it as anonymous", () => {
    expect(unauthorized(() => optionalGuard.canActivate(contextFor(requestWith("Bearer "))))).toEqual({
      code: "UNAUTHORIZED",
      status: 401,
      message: "Invalid or expired token",
    });
  });

  it("rejects an invalid token instead of treating it as anonymous", () => {
    expect(unauthorized(() => optionalGuard.canActivate(contextFor(requestWith("Bearer not-a-jwt")))).status).toBe(401);
  });
});
