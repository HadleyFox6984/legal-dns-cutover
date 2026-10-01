import { readFile } from "node:fs/promises";
import { cutoverRequestSchema } from "./cutover_decision.ts";
import { InfraiDns } from "./infrai_dns.ts";
import { runLegalCutover } from "./legal_cutover.ts";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before running a cutover");

const inputPath = process.argv[2];
if (!inputPath) throw new Error("Pass a matter JSON path as the first argument");

const input = cutoverRequestSchema.parse(JSON.parse(await readFile(inputPath, "utf8")));
const result = await runLegalCutover(input, new InfraiDns(apiKey));
console.log(JSON.stringify(result, null, 2));
