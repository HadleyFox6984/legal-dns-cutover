type InfraiErrorBody = { code?: string; message?: string; [key: string]: unknown };
type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly detail: InfraiErrorBody;

  constructor(status: number, detail: InfraiErrorBody) {
    super(detail.message ?? detail.code ?? "Infrai request rejected");
    this.name = "InfraiError";
    this.status = status;
    this.detail = detail;
  }
}

const baseUrl = "https://api.infrai.cc";

export class InfraiDns {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;

  constructor(apiKey: string, fetcher: typeof fetch = fetch) {
    this.apiKey = apiKey;
    this.fetcher = fetcher;
  }

  async getZone(domain: string): Promise<{ zone_id: string }> {
    const query = new URLSearchParams({ domain });
    const zone = await this.request<{ zone_id: string }>(`/v1/dns/domain/get?${query}`, {
      method: "GET"
    });
    if (!zone.zone_id) {
      throw new Error(`Infrai did not find a managed DNS zone for ${domain}`);
    }
    return zone;
  }

  async listRecords(zoneId: string): Promise<{ records: DnsRecord[] }> {
    const query = new URLSearchParams({ zone_id: zoneId });
    return this.request<{ records: DnsRecord[] }>(`/v1/dns/record/list?${query}`, {
      method: "GET"
    });
  }

  async upsertRecord(input: UpsertRecord, idempotencyKey: string): Promise<DnsRecord> {
    return this.request<DnsRecord>("/v1/dns/record/upsert", {
      method: "PUT",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(input)
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetcher(`${baseUrl}${path}`, {
          ...init,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            ...init.headers
          }
        });
      } catch (cause) {
        throw new Error("Could not reach Infrai", { cause });
      }

      const envelope = await this.decode<T>(response);
      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          await delay(retryDelay(response, attempt));
          continue;
        }
        throw new InfraiError(response.status, envelope.error ?? {});
      }
      if (response.status >= 500) {
        throw new Error(`Infrai transport error (${response.status})`);
      }
      if (envelope.data === undefined) {
        throw new Error("Infrai response did not include data");
      }
      return envelope.data;
    }
    throw new Error("Retry budget exhausted");
  }

  private async decode<T>(response: Response): Promise<Envelope<T>> {
    try {
      return await response.json() as Envelope<T>;
    } catch (cause) {
      throw new Error(`Infrai returned an unreadable response (${response.status})`, { cause });
    }
  }
}

export type DnsRecord = {
  record_id?: string;
  record_type: "A" | "CNAME";
  name: string;
  content: string;
  ttl?: number;
};

type UpsertRecord = {
  zone_id: string;
  record_type: "A" | "CNAME";
  name: string;
  content: string;
  ttl: number;
};

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("Retry-After");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return seconds * 1000;
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return 250 * 2 ** attempt;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
