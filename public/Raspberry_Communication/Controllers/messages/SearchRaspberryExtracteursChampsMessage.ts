/**
 * Extraction de champs depuis les objets JSON renvoyés par le serveur Raspberry.
 */

export function extraireAdresseIpDepuisMessage(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "";
  }
  const record = value as Record<string, unknown>;
  const ip = record.raspIP || record.ipAddress || record.ip || record.addressIP;
  return typeof ip === "string" ? ip : "";
}

export function extraireAdresseMacDepuisMessage(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "";
  }
  const record = value as Record<string, unknown>;
  const mac = record.macAddress || record.raspMAC || record.mac || record.macAddr;
  return typeof mac === "string" ? mac : "";
}

export function extraireTexteInfoDepuisMessage(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "";
  }
  const record = value as Record<string, unknown>;
  if (typeof record.label === "string" && record.label.length > 0) {
    return record.label;
  }
  if (typeof record.info === "string") {
    return record.info;
  }
  if (typeof record.memory === "string") {
    return record.memory;
  }
  return "";
}

export function extrairePingOkDepuisMessage(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  return !!(value as Record<string, unknown>).pingOk;
}

export function extraireArpVuDepuisMessage(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  return !!(value as Record<string, unknown>).arpSeen;
}

export function extraireHorodatageSondageReseauDepuisMessage(value: unknown): number {
  if (!value || typeof value !== "object") {
    return 0;
  }
  const record = value as Record<string, unknown>;
  // Serveur de modulePre : l'âge, pour ne pas comparer deux horloges (navigateur et serveur).
  if (typeof record.checkedAgeMs === "number" && Number.isFinite(record.checkedAgeMs)) {
    return record.checkedAgeMs < 0 ? 0 : Date.now() - record.checkedAgeMs;
  }
  const checkedAt = record.checkedAtMs || record.networkCheckedAtMs;
  if (typeof checkedAt === "number" && Number.isFinite(checkedAt)) {
    return checkedAt;
  }
  return 0;
}

export function extraireDernierHeartbeatDepuisMessage(value: unknown): number {
  if (!value || typeof value !== "object") {
    return Date.now();
  }
  const record = value as Record<string, unknown>;
  // Serveur de modulePre : l'âge du dernier battement, ramené à l'horloge du navigateur.
  if (typeof record.ageMs === "number" && Number.isFinite(record.ageMs) && record.ageMs >= 0) {
    return Date.now() - record.ageMs;
  }
  const lastHeartbeat = record.lastHeartbeatMs || record.lastHeartbeat || record.timestamp;
  if (typeof lastHeartbeat === "number" && Number.isFinite(lastHeartbeat)) {
    return lastHeartbeat;
  }
  return Date.now();
}
