import { Hono } from "hono";

export function hello(): string {
  return "hello";
}

const app = new Hono();

app.get("/", (c) => c.text(hello()));

export default app;
