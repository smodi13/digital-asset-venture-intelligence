"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  RADAR_CHANGE_EVENT,
  RADAR_STORAGE_KEY,
  addRadarId,
  parseRadarIds,
  removeRadarId,
  serializeRadarIds,
} from "@/lib/radar/storage";

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(RADAR_STORAGE_KEY);
  } catch {
    return null;
  }
}

function readIds(): string[] {
  return parseRadarIds(readRaw());
}

function writeIds(ids: string[]) {
  try {
    window.localStorage.setItem(RADAR_STORAGE_KEY, serializeRadarIds(ids));
    window.dispatchEvent(new CustomEvent(RADAR_CHANGE_EVENT));
  } catch {
    // Storage unavailable: the add/remove action silently has no effect this session.
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(RADAR_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(RADAR_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

const EMPTY: string[] = [];

// useSyncExternalStore requires getSnapshot to return a stable reference when
// the underlying value has not changed - reparsing localStorage on every call
// would return a fresh array each time and loop forever.
let cachedRaw: string | null | undefined;
let cachedIds: string[] = EMPTY;

function getSnapshot(): string[] {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedIds = readIds();
  }
  return cachedIds;
}

/** Reads and writes the browser-local Follow-On Radar set, kept in sync across every mounted instance on the page. */
export function useRadar() {
  const ids = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const add = useCallback((id: string) => writeIds(addRadarId(readIds(), id)), []);
  const remove = useCallback((id: string) => writeIds(removeRadarId(readIds(), id)), []);
  const toggle = useCallback((id: string) => (readIds().includes(id) ? remove(id) : add(id)), [add, remove]);
  const has = useCallback((id: string) => ids.includes(id), [ids]);

  return { ids, hydrated, add, remove, toggle, has };
}
