import { v7 as uuidv7 } from "uuid";
import { db } from "@/db/client";

const DEVICE_ID_KEY = "deviceId";

export async function getDeviceId(): Promise<string> {
  const existing = await db.settings.get(DEVICE_ID_KEY);
  if (existing) return existing.value;
  const id = uuidv7();
  await db.settings.put({ key: DEVICE_ID_KEY, value: id });
  return id;
}
