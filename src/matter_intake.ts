import { createServer } from "node:http";
import { ZodError } from "zod";
import { cutoverRequestSchema, CutoverRejected } from "./cutover_decision.ts";
import { InfraiError, InfraiDns } from "./infrai_dns.ts";
import { runLegalCutover } from "./legal_cutover.ts";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const dns = new InfraiDns(apiKey);
const port = Number(process.env.PORT ?? 3000);

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/matters/cutover") {
    return send(response, 404, { error: "Route not found" });
  }

  try {
    const input = cutoverRequestSchema.parse(await readJson(request));
    const result = await runLegalCutover(input, dns);
    return send(response, 200, result);
  } catch (error) {
    if (error instanceof ZodError) return send(response, 400, { error: "Invalid request", issues: error.issues });
    if (error instanceof CutoverRejected) return send(response, 409, { error: error.message });
    if (error instanceof InfraiError && error.status < 500) {
      return send(response, error.status, { error: error.message, detail: error.detail });
    }
    console.error(error);
    return send(response, 502, { error: "Cutover service could not complete the request" });
  }
}).listen(port, () => {
  console.log(`Matter intake listening on http://localhost:${port}`);
});

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}
