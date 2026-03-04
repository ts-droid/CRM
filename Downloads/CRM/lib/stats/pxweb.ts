import { getResearchConfig } from "@/lib/admin/settings";

type PxWebVariable = {
  code?: string;
  text?: string;
  values?: string[];
  valueTexts?: string[];
};

type PxWebMetadata = {
  title?: string;
  variables?: PxWebVariable[];
};

type PxWebSelection = {
  code: string;
  selection: {
    filter: "item";
    values: string[];
  };
};

type PxWebDataResponse = {
  columns?: Array<{
    code?: string;
    text?: string;
    type?: string;
  }>;
  data?: Array<{
    key?: string[];
    values?: string[];
  }>;
};

export type PxWebConfig = {
  baseUrl: string;
  tablePath: string;
  sniVariable: string;
  regionVariable: string;
  timeVariable: string;
  contentVariable: string;
  defaultContentCode: string;
};

export type SniLookupParams = {
  sniCodes: string[];
  region?: string | null;
  time?: string | null;
  contentCode?: string | null;
  maxRows?: number;
};

export type SniStatisticRow = {
  sniCode: string;
  dimensions: Record<string, string>;
  value: number | null;
  rawValue: string;
};

export type SniLookupResult = {
  configured: boolean;
  config: PxWebConfig;
  tableTitle: string;
  variables: Array<{ code: string; text: string }>;
  rows: SniStatisticRow[];
  totalRows: number;
  selected: {
    sniCodes: string[];
    region: string | null;
    time: string | null;
    contentCode: string | null;
  };
};

function normalizeBaseUrl(value: string): string {
  return String(value ?? "").trim().replace(/\/+$/, "");
}

function normalizeTablePath(value: string): string {
  return String(value ?? "").trim().replace(/^\/+/, "");
}

function normalizeCode(value: string): string {
  return String(value ?? "").trim();
}

function normalizeCodeLower(value: string): string {
  return normalizeCode(value).toLowerCase();
}

function toNumber(value: string): number | null {
  const normalized = String(value ?? "").replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function findVariableByCandidates(variables: PxWebVariable[], explicitCode: string, candidates: string[]): PxWebVariable | null {
  const byExplicit = variables.find((variable) => normalizeCodeLower(variable.code ?? "") === normalizeCodeLower(explicitCode));
  if (byExplicit) return byExplicit;

  for (const candidate of candidates) {
    const byCandidate = variables.find((variable) => normalizeCodeLower(variable.code ?? "") === normalizeCodeLower(candidate));
    if (byCandidate) return byCandidate;
  }

  for (const candidate of candidates) {
    const byContains = variables.find((variable) => normalizeCodeLower(variable.code ?? "").includes(normalizeCodeLower(candidate)));
    if (byContains) return byContains;
  }

  return null;
}

async function fetchMetadata(config: PxWebConfig): Promise<PxWebMetadata> {
  const res = await fetch(`${config.baseUrl}/${config.tablePath}`, {
    method: "GET",
    cache: "no-store"
  });
  if (!res.ok) {
    throw new Error(`PxWeb metadata request failed (${res.status})`);
  }
  return (await res.json()) as PxWebMetadata;
}

function pickDefaultValue(variable: PxWebVariable): string | null {
  const values = Array.isArray(variable.values) ? variable.values : [];
  if (values.length === 0) return null;
  const code = normalizeCodeLower(variable.code ?? "");
  if (code.includes("time") || code.includes("tid") || code.includes("year")) {
    return values[values.length - 1] ?? null;
  }
  return values[0] ?? null;
}

function buildSelections(metadata: PxWebMetadata, config: PxWebConfig, params: SniLookupParams): PxWebSelection[] {
  const variables = Array.isArray(metadata.variables) ? metadata.variables : [];
  const sniVar = findVariableByCandidates(variables, config.sniVariable, ["SNI2007", "SNI", "nace", "branch"]);
  if (!sniVar?.code) {
    throw new Error("PxWeb SNI variable not found in table metadata");
  }
  const regionVar = findVariableByCandidates(variables, config.regionVariable, ["Region", "Län", "Lan", "County", "Kommun"]);
  const timeVar = findVariableByCandidates(variables, config.timeVariable, ["Tid", "Time", "År", "Ar", "Year"]);
  const contentVar = findVariableByCandidates(variables, config.contentVariable, ["ContentsCode", "Contents", "Mått", "Matt", "Measure"]);

  const selections: PxWebSelection[] = [];
  const wantedSni = params.sniCodes.map((value) => normalizeCode(value)).filter(Boolean);
  if (wantedSni.length === 0) {
    throw new Error("At least one SNI code is required");
  }
  selections.push({
    code: String(sniVar.code),
    selection: {
      filter: "item",
      values: wantedSni
    }
  });

  for (const variable of variables) {
    const code = String(variable.code ?? "").trim();
    if (!code) continue;
    const codeLower = normalizeCodeLower(code);
    if (codeLower === normalizeCodeLower(sniVar.code ?? "")) continue;

    if (regionVar?.code && codeLower === normalizeCodeLower(regionVar.code)) {
      const wanted = normalizeCode(params.region ?? "") || pickDefaultValue(variable);
      if (wanted) {
        selections.push({
          code,
          selection: { filter: "item", values: [wanted] }
        });
      }
      continue;
    }

    if (timeVar?.code && codeLower === normalizeCodeLower(timeVar.code)) {
      const wanted = normalizeCode(params.time ?? "") || pickDefaultValue(variable);
      if (wanted) {
        selections.push({
          code,
          selection: { filter: "item", values: [wanted] }
        });
      }
      continue;
    }

    if (contentVar?.code && codeLower === normalizeCodeLower(contentVar.code)) {
      const wanted = normalizeCode(params.contentCode ?? "") || normalizeCode(config.defaultContentCode) || pickDefaultValue(variable);
      if (wanted) {
        selections.push({
          code,
          selection: { filter: "item", values: [wanted] }
        });
      }
      continue;
    }

    const fallbackValue = pickDefaultValue(variable);
    if (fallbackValue) {
      selections.push({
        code,
        selection: { filter: "item", values: [fallbackValue] }
      });
    }
  }

  return selections;
}

async function fetchData(config: PxWebConfig, query: PxWebSelection[]): Promise<PxWebDataResponse> {
  const res = await fetch(`${config.baseUrl}/${config.tablePath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      query,
      response: { format: "json" }
    })
  });
  if (!res.ok) {
    const message = await res.text().catch(() => "");
    throw new Error(`PxWeb data request failed (${res.status})${message ? `: ${message.slice(0, 180)}` : ""}`);
  }
  return (await res.json()) as PxWebDataResponse;
}

function parseRows(data: PxWebDataResponse, maxRows: number): SniStatisticRow[] {
  const columns = Array.isArray(data.columns) ? data.columns : [];
  const rows = Array.isArray(data.data) ? data.data : [];
  const out: SniStatisticRow[] = [];

  for (const row of rows.slice(0, Math.max(1, maxRows))) {
    const keys = Array.isArray(row.key) ? row.key : [];
    const values = Array.isArray(row.values) ? row.values : [];
    const firstValue = String(values[0] ?? "");
    const dimensions: Record<string, string> = {};
    for (let index = 0; index < columns.length; index += 1) {
      const column = columns[index];
      const label = String(column?.text || column?.code || `dim_${index + 1}`);
      dimensions[label] = String(keys[index] ?? "");
    }
    const firstDimensionValue = Object.values(dimensions)[0] ?? "";
    out.push({
      sniCode: String(firstDimensionValue),
      dimensions,
      value: toNumber(firstValue),
      rawValue: firstValue
    });
  }

  return out;
}

export async function getPxWebConfig(): Promise<PxWebConfig> {
  const settings = await getResearchConfig();
  return {
    baseUrl: normalizeBaseUrl(settings.pxwebBaseUrl || process.env.PXWEB_API_BASE_URL || ""),
    tablePath: normalizeTablePath(settings.pxwebSniTablePath || process.env.PXWEB_SNI_TABLE_PATH || ""),
    sniVariable: normalizeCode(settings.pxwebSniVariable || process.env.PXWEB_SNI_VARIABLE || "SNI2007"),
    regionVariable: normalizeCode(settings.pxwebRegionVariable || process.env.PXWEB_REGION_VARIABLE || "Region"),
    timeVariable: normalizeCode(settings.pxwebTimeVariable || process.env.PXWEB_TIME_VARIABLE || "Tid"),
    contentVariable: normalizeCode(settings.pxwebContentVariable || process.env.PXWEB_CONTENT_VARIABLE || "ContentsCode"),
    defaultContentCode: normalizeCode(settings.pxwebDefaultContentCode || process.env.PXWEB_DEFAULT_CONTENT_CODE || "")
  };
}

export function isPxWebConfigured(config: PxWebConfig): boolean {
  return Boolean(config.baseUrl && config.tablePath);
}

export async function lookupSniStatistics(params: SniLookupParams): Promise<SniLookupResult> {
  const config = await getPxWebConfig();
  if (!isPxWebConfigured(config)) {
    return {
      configured: false,
      config,
      tableTitle: "",
      variables: [],
      rows: [],
      totalRows: 0,
      selected: {
        sniCodes: params.sniCodes,
        region: params.region ?? null,
        time: params.time ?? null,
        contentCode: params.contentCode ?? null
      }
    };
  }

  const metadata = await fetchMetadata(config);
  const query = buildSelections(metadata, config, params);
  const data = await fetchData(config, query);
  const rows = parseRows(data, params.maxRows ?? 200);

  return {
    configured: true,
    config,
    tableTitle: String(metadata.title ?? ""),
    variables: (metadata.variables ?? []).map((variable) => ({
      code: String(variable.code ?? ""),
      text: String(variable.text ?? variable.code ?? "")
    })),
    rows,
    totalRows: Array.isArray(data.data) ? data.data.length : rows.length,
    selected: {
      sniCodes: params.sniCodes,
      region: params.region ?? null,
      time: params.time ?? null,
      contentCode: params.contentCode ?? null
    }
  };
}

