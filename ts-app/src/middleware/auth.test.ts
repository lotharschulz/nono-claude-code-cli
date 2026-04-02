import * as express from "express";
import * as request from "supertest";
import * as jwt from "jsonwebtoken";
import { authenticateToken, JWT_SECRET } from "./auth";

const app = express();
app.use(express.json());
app.get("/protected", authenticateToken, (_req: express.Request, res: express.Response) => {
  res.json({ ok: true });
});

function makeToken(payload: object, secret = JWT_SECRET, options?: jwt.SignOptions) {
  return jwt.sign(payload, secret, options);
}

describe("authenticateToken middleware", () => {
  it("returns 401 when no Authorization header", async () => {
    const res = await request(app).get("/protected");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Missing token");
  });

  it("returns 401 when Authorization header has no Bearer prefix", async () => {
    const res = await request(app)
      .get("/protected")
      .set("Authorization", "Basic sometoken");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Missing token");
  });

  it("returns 403 for an invalid token", async () => {
    const res = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer not.a.valid.token");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Invalid or expired token");
  });

  it("returns 403 for a token signed with wrong secret", async () => {
    const token = makeToken({ sub: "user1" }, "wrong-secret");
    const res = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Invalid or expired token");
  });

  it("returns 403 for an expired token", async () => {
    const token = makeToken({ sub: "user1" }, JWT_SECRET, { expiresIn: -1 });
    const res = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Invalid or expired token");
  });

  it("returns 200 with a valid token", async () => {
    const token = makeToken({ sub: "user1" });
    const res = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
