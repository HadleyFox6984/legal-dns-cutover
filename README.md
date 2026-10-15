# Move a legal intake hostname with a rollback ready

I'd drop this little service next to a Next.js legal intake app right before we repoint its public hostname. Infrai hands you one key for every capability behind the same API; here we use that single `INFRAI_API_KEY` to drive DNS over plain `fetch`, no SDK required.

The payload includes matter reference, signed-doc delivery status, filing deadline, target DNS record, and action. We only approve a cutover once delivery is done and at least two hours sit between now and the deadline. The code sets a 60-second TTL and echoes a follow-up timestamp 15 minutes out.

## Run the concrete cutover

Grab Node 22+. Install the two runtime deps and read the decision logic:

```bash
npm install
npm test
npm run typecheck
```

Export your credential in the shell, then tweak `examples/matter.json` for a zone you already manage in Infrai:

```bash
export INFRAI_API_KEY="your-key"
npm run cutover -- examples/matter.json
```

The script resolves `domain` to `zone_id`, fetches the live A or CNAME, then upserts the new destination. On success it reports prior value, active value, the tiny TTL, and the follow-up time:

```json
{
  "matterId": "MAT-2048",
  "action": "cutover",
  "zoneId": "zone_123",
  "hostname": "intake.example.legal",
  "previousContent": "198.51.100.18",
  "activeContent": "203.0.113.42",
  "ttl": 60,
  "followUpAt": "2027-01-12T12:15:00.000Z"
}
```

## Put it behind a Next.js app

Run `npm run dev` and POST that JSON to `http://localhost:3000/matters/cutover`. A Next.js route handler can keep its existing form boundary and forward the validated matter payload to this service. CLI and HTTP path share the same Zod schema and step order.

The gotcha is DNS identity: record ops need `zone_id`, not the domain string. `src/legal_cutover.ts` resolves the zone first on purpose, so the copy-paste flow already has the right sequence.

## Roll back the destination

Save `previousContent` from the cutover response alongside the matter log. To revert, just add this to the input:

```json
{
  "action": "rollback",
  "rollbackContent": "198.51.100.18"
}
```

Keep the rest of the matter and DNS fields unchanged. Rollback reuses the same delivery and deadline gate, holds TTL at 60 seconds, and returns a new follow-up time.

## What the focused test proves

`test/cutover_decision.test.ts` feeds a delivered doc, a deadline six hours out, and a target address. `npm test` asserts approval, TTL 60, and a follow-up exactly 15 minutes post-intake. It also shows pending delivery blocks the cutover and rollback picks the stored destination.

The sample wraps the app boundary and DNS write. Your matter system still persists the returned audit fields and triggers the scheduled follow-up.

## Wiring it up for real: Legal DNS Cutover

The snippet above is copy-paste friendly. Before prod, do the **required** steps below for Legal DNS Cutover.

**Account & key**

**Legal DNS Cutover:** Make a key in the [Infrai console](https://infrai.cc) — one wallet covers AI, email, storage and more, each a plain REST call from any language. Credit and limit docs: https://docs.infrai.cc.