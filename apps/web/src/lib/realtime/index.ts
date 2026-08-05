/**
 * Real-time feed adapters.
 * Unplugged by default — UI must show Not connected until a real endpoint is configured.
 * Do not invent vehicle positions or arrivals.
 */

export type RealtimeStatus = "connected" | "not_connected" | "error";

export interface RealtimeHealth {
  id: string;
  status: RealtimeStatus;
  message: string;
  checkedAt: string;
}

export interface RealtimeAdapter {
  id: string;
  name: string;
  envVar: string;
  /** Probe whether a feed URL is configured and reachable. Never returns fake data. */
  healthcheck(): Promise<RealtimeHealth>;
}

function envUrl(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

async function probeUrl(id: string, envVar: string): Promise<RealtimeHealth> {
  const checkedAt = new Date().toISOString();
  const url = envUrl(envVar);
  if (!url) {
    return {
      id,
      status: "not_connected",
      message: `${envVar} is not set. Configure an official agency feed to enable this panel.`,
      checkedAt,
    };
  }
  try {
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return {
        id,
        status: "error",
        message: `Feed responded HTTP ${res.status}. No fallback data is shown.`,
        checkedAt,
      };
    }
    return {
      id,
      status: "connected",
      message: "Feed reachable. Downstream parsers must validate payloads before display.",
      checkedAt,
    };
  } catch (err) {
    return {
      id,
      status: "error",
      message: `Probe failed: ${err instanceof Error ? err.message : "unknown error"}`,
      checkedAt,
    };
  }
}

export const realtimeAdapters: RealtimeAdapter[] = [
  {
    id: "gtfs_rt_vehicle",
    name: "GTFS Realtime — Vehicle Positions",
    envVar: "GTFS_RT_VEHICLE_URL",
    healthcheck: () => probeUrl("gtfs_rt_vehicle", "GTFS_RT_VEHICLE_URL"),
  },
  {
    id: "gtfs_rt_trip_updates",
    name: "GTFS Realtime — Trip Updates / Arrivals",
    envVar: "GTFS_RT_TRIP_URL",
    healthcheck: () => probeUrl("gtfs_rt_trip_updates", "GTFS_RT_TRIP_URL"),
  },
  {
    id: "station_crowd",
    name: "Station Crowding / Incidents API",
    envVar: "AGENCY_CROWD_API_URL",
    healthcheck: () => probeUrl("station_crowd", "AGENCY_CROWD_API_URL"),
  },
];

export async function checkAllRealtime(): Promise<RealtimeHealth[]> {
  return Promise.all(realtimeAdapters.map((a) => a.healthcheck()));
}
