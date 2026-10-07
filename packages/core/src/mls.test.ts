import { describe, expect, it } from "vitest";
import { acceptWelcome, addMembers, createIdentity, decryptText, encryptText, loadSuite, runMlsBench, sframeKey, startGroup } from "./mls.ts";

describe("mls spike", () => {
  it("all members derive the same SFrame key, and it rotates on membership change", async () => {
    const cs = await loadSuite();
    const [a, b, c] = await Promise.all(["ayse", "bora", "cem"].map((n) => createIdentity(n, cs)));
    let aState = await startGroup("voice-1", a!, cs);

    const add1 = await addMembers(aState, [b!.publicPackage], cs);
    aState = add1.state;
    let bState = await acceptWelcome(add1.welcome, b!, aState.ratchetTree, cs);
    const k1a = await sframeKey(aState, cs);
    const k1b = await sframeKey(bState, cs);
    expect(k1a.key).toEqual(k1b.key);
    expect(k1a.key).toHaveLength(32);

    const msg = await encryptText(aState, "merhaba", cs);
    aState = msg.state;
    const got = await decryptText(bState, msg.message, cs);
    bState = got.state;
    expect(got.text).toBe("merhaba");

    const add2 = await addMembers(aState, [c!.publicPackage], cs);
    const k2 = await sframeKey(add2.state, cs);
    expect(k2.epoch).toBe(k1a.epoch + 1n);
    expect(k2.key).not.toEqual(k1a.key);
  });

  it("bench runs end to end", async () => {
    const r = await runMlsBench(5);
    expect(r.keysMatch).toBe(true);
    expect(r.roundTripOk).toBe(true);
  });
});
