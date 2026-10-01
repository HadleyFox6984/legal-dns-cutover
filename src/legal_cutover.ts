import { decideCutover, type CutoverRequest } from "./cutover_decision.ts";
import { InfraiDns } from "./infrai_dns.ts";

export type CutoverResult = {
  matterId: string;
  action: "cutover" | "rollback";
  zoneId: string;
  hostname: string;
  previousContent: string | null;
  activeContent: string;
  ttl: number;
  followUpAt: string;
};

export async function runLegalCutover(
  input: CutoverRequest,
  dns: InfraiDns,
  now = new Date()
): Promise<CutoverResult> {
  const decision = decideCutover(input, now);
  const zone = await dns.getZone(input.domain);
  const listing = await dns.listRecords(zone.zone_id);
  const previous = listing.records.find(
    (record) => record.name === input.hostname && record.record_type === input.recordType
  );

  const record = await dns.upsertRecord({
    zone_id: zone.zone_id,
    record_type: input.recordType,
    name: input.hostname,
    content: decision.effectiveContent,
    ttl: decision.ttl
  }, `${input.matterId}:${input.action}:${input.hostname}:${decision.effectiveContent}`);

  return {
    matterId: input.matterId,
    action: input.action,
    zoneId: zone.zone_id,
    hostname: input.hostname,
    previousContent: previous?.content ?? null,
    activeContent: record.content,
    ttl: record.ttl ?? decision.ttl,
    followUpAt: decision.followUpAt
  };
}
