import { beforeEach, describe, expect, it } from "vitest";
import { recentsStore } from "../recents";

const STORAGE_KEY = "password-generator-recents";

describe("recentsStore", () => {
  beforeEach(() => {
    // recents.ts caches its list in module scope (see its file comment), so
    // resetting must go through the store itself rather than clearing
    // localStorage directly, or the in-memory cache would leak between
    // tests even though storage was wiped.
    recentsStore.clear();
  });

  it("starts empty", () => {
    expect(recentsStore.list()).toEqual([]);
  });

  it("adds values newest-first", () => {
    recentsStore.add("a");
    recentsStore.add("b");
    recentsStore.add("c");

    expect(recentsStore.list()).toEqual(["c", "b", "a"]);
  });

  it("caps the list at 10 entries", () => {
    for (let i = 1; i <= 10; i += 1) {
      recentsStore.add(`value-${i}`);
    }

    const list = recentsStore.list();
    expect(list).toHaveLength(10);
    expect(list[0]).toBe("value-10");
    expect(list.at(-1)).toBe("value-1");
  });

  it("drops the oldest entry and leads with the newest once an 11th is added", () => {
    for (let i = 1; i <= 10; i += 1) {
      recentsStore.add(`value-${i}`);
    }
    recentsStore.add("value-11");

    const list = recentsStore.list();
    expect(list).toHaveLength(10);
    expect(list[0]).toBe("value-11");
    expect(list).not.toContain("value-1");
    expect(list.at(-1)).toBe("value-2");
  });

  it("returns bare string values with no attached metadata", () => {
    recentsStore.add("bare-value");

    const list = recentsStore.list();
    expect(list).toEqual(["bare-value"]);
    expect(typeof list[0]).toBe("string");
  });

  it("persists to localStorage directly, so a fresh read after a reload sees it", () => {
    recentsStore.add("persisted-value");

    // Read the underlying storage directly rather than through the store,
    // to prove state lives in localStorage and not just in JS memory —
    // this is what makes it survive a page reload.
    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual(["persisted-value"]);
  });

  it("clear empties both the list and its underlying storage", () => {
    recentsStore.add("x");
    recentsStore.add("y");

    recentsStore.clear();

    expect(recentsStore.list()).toEqual([]);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify([]));
  });
});
