import { BadRequestException, NotFoundException } from "@nestjs/common";

import { AppError } from "./app-error";
import { toErrorResponse } from "./app-exception.filter";

describe("toErrorResponse", () => {
  it("renders an AppError with its code, status and details", () => {
    expect(toErrorResponse(new AppError("SLUG_TAKEN", 409, "Slug already used", { slug: "x" }))).toEqual({
      status: 409,
      body: { error: { code: "SLUG_TAKEN", message: "Slug already used", details: { slug: "x" } } },
    });
  });

  it("turns ValidationPipe errors into VALIDATION_FAILED with the messages as details", () => {
    const { status, body } = toErrorResponse(new BadRequestException(["name must be a string"]));
    expect(status).toBe(400);
    expect(body.error).toEqual({ code: "VALIDATION_FAILED", message: "Request validation failed", details: ["name must be a string"] });
  });

  it("maps framework HttpExceptions to a code by status", () => {
    expect(toErrorResponse(new NotFoundException("Cannot GET /x")).body.error).toEqual({ code: "NOT_FOUND", message: "Cannot GET /x" });
  });

  it("hides unknown errors behind an opaque 500", () => {
    expect(toErrorResponse(new Error("db password is hunter2"))).toEqual({
      status: 500,
      body: { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
    });
  });
});
