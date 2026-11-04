import { describe, expect, it } from "vitest";

import { changedFields, hostAllowed, isGuid, isOpsHost, opsFailure, originAllowed, requestHost } from "./guard";

describe("requestHost", () => {
  it("prefers the platform's forwarded host, first of a list, in lower case", () => {
    expect(requestHost(new Headers({ host: "internal", "x-forwarded-host": "Ops.Example.com, proxy" }))).toBe("ops.example.com");
  });

  it("falls back to Host", () => {
    expect(requestHost(new Headers({ host: "localhost:3000" }))).toBe("localhost:3000");
    expect(requestHost(new Headers())).toBeNull();
  });
});

describe("hostAllowed", () => {
  it("lets any host in without OPS_HOST", () => {
    expect(hostAllowed(undefined, "anything.example")).toBe(true);
    expect(hostAllowed(undefined, null)).toBe(true);
  });

  it("with OPS_HOST lets in that host only", () => {
    expect(hostAllowed("ops.example.com", "ops.example.com")).toBe(true);
    expect(hostAllowed("ops.example.com", "app.example.com")).toBe(false);
    expect(hostAllowed("ops.example.com", "ops.example.com.evil.test")).toBe(false);
    expect(hostAllowed("ops.example.com", null)).toBe(false);
  });

  it("reads a port only when OPS_HOST names one", () => {
    expect(hostAllowed("localhost", "localhost:3000")).toBe(true);
    expect(hostAllowed("localhost:3000", "localhost:3000")).toBe(true);
    expect(hostAllowed("localhost:3000", "localhost:4000")).toBe(false);
  });
});

describe("isOpsHost", () => {
  it("is false on every deployment without OPS_HOST", () => {
    expect(isOpsHost(undefined, "ops.example.com")).toBe(false);
    expect(isOpsHost("", "ops.example.com")).toBe(false);
  });

  it("names the console's own address", () => {
    expect(isOpsHost("OPS.example.com", "ops.example.com")).toBe(true);
    expect(isOpsHost("ops.example.com", "app.example.com")).toBe(false);
  });
});

describe("originAllowed", () => {
  it("refuses a write with no Origin: scripts have no way round it", () => {
    expect(originAllowed(null, "app.example.com")).toBe(false);
    expect(originAllowed("", "app.example.com")).toBe(false);
  });

  it("wants the Origin's host to be this host, with its port", () => {
    expect(originAllowed("https://app.example.com", "app.example.com")).toBe(true);
    expect(originAllowed("http://localhost:3000", "localhost:3000")).toBe(true);
    expect(originAllowed("http://localhost:4000", "localhost:3000")).toBe(false);
    expect(originAllowed("https://evil.test", "app.example.com")).toBe(false);
    expect(originAllowed("https://app.example.com.evil.test", "app.example.com")).toBe(false);
  });

  it("refuses what is no address, and an unknown host", () => {
    expect(originAllowed("null", "app.example.com")).toBe(false);
    expect(originAllowed("https://app.example.com", null)).toBe(false);
  });
});

describe("changedFields", () => {
  it("names what changes and never carries a value", () => {
    const fields = changedFields({ title: "Секретный текст", body: null, deadline: undefined });
    expect(fields).toEqual(["title", "body"]);
    expect(JSON.stringify(fields)).not.toContain("Секретный");
  });
});

describe("isGuid", () => {
  it("takes any 8-4-4-4-12 hex: seed ids are not RFC-4122", () => {
    expect(isGuid("11111111-1111-1111-1111-111111111111")).toBe(true);
    expect(isGuid("not-a-guid")).toBe(false);
    expect(isGuid("11111111-1111-1111-1111-11111111111")).toBe(false);
  });
});

describe("opsFailure", () => {
  it("maps the two codes a screen acts on", () => {
    expect(opsFailure("ops_denied")).toMatchObject({ status: 401, code: "unauthorized" });
    expect(opsFailure("ops_fresh_required")).toMatchObject({ status: 428, code: "fresh_required" });
  });

  it("names every code of the contract the base raises", () => {
    expect(opsFailure("confirm_mismatch").code).toBe("confirm_mismatch");
    expect(opsFailure("export_required").code).toBe("export_required");
    expect(opsFailure("not_found")).toMatchObject({ status: 404, code: "not_found" });
    expect(opsFailure("not_director").code).toBe("not_director");
    expect(opsFailure("slug_taken")).toMatchObject({ status: 409, code: "slug_taken" });
    expect(opsFailure("email_exists")).toMatchObject({ status: 409, code: "email_exists" });
    expect(opsFailure("already_director").code).toBe("already_director");
    expect(opsFailure("purge_incomplete")).toMatchObject({ status: 500, code: "purge_incomplete" });
    expect(opsFailure("bad_patch")).toMatchObject({ status: 400, code: "validation_error" });
  });

  it("reads a dead or missing JWT as a denial, whatever the words", () => {
    expect(opsFailure("permission denied for function ops_ticket", "42501").status).toBe(401);
    expect(opsFailure("JWT expired", "PGRST303").status).toBe(401);
  });

  it("lets a raised code win over its sqlstate", () => {
    expect(opsFailure("ops_fresh_required", "42501").status).toBe(428);
  });

  it("reads a clash on the address as a taken address, and only that one", () => {
    expect(opsFailure('duplicate key value violates unique constraint "companies_slug_key"', "23505").code).toBe("slug_taken");
    expect(opsFailure('duplicate key value violates unique constraint "profiles_pkey"', "23505").code).toBe("internal");
  });

  it("says nothing of what it does not know", () => {
    expect(opsFailure("relation does not exist", "42P01")).toMatchObject({ status: 500, code: "internal" });
    expect(opsFailure("constructor")).toMatchObject({ status: 500, code: "internal" });
  });
});
