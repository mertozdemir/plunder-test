/**
 * Phase 0 spike: MLS (RFC 9420) group keys in the browser, and deriving the
 * per-epoch SFrame media key from the MLS exporter so voice/screen E2EE keys
 * rotate whenever group membership changes.
 *
 * Uses ts-mls (pure TypeScript, unaudited). The plan doc names OpenMLS; this
 * spike measures whether a JS implementation is fast enough before we commit
 * to shipping OpenMLS as WASM (web) and a Rust native module (Expo).
 */
import {
  type CiphersuiteImpl,
  type CiphersuiteName,
  type ClientState,
  type Credential,
  type KeyPackage,
  type PrivateKeyPackage,
  type Proposal,
  type Welcome,
  createApplicationMessage,
  createCommit,
  createGroup,
  defaultCapabilities,
  defaultLifetime,
  emptyPskIndex,
  generateKeyPackage,
  getCiphersuiteFromName,
  getCiphersuiteImpl,
  joinGroup,
  mlsExporter,
  processPrivateMessage,
  type PrivateMessage,
} from "ts-mls";

export const DEFAULT_SUITE: CiphersuiteName = "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519";
const SFRAME_LABEL = "plunder sframe";
const enc = new TextEncoder();
const dec = new TextDecoder();

export async function loadSuite(name: CiphersuiteName = DEFAULT_SUITE): Promise<CiphersuiteImpl> {
  return getCiphersuiteImpl(getCiphersuiteFromName(name));
}

export interface Identity {
  name: string;
  publicPackage: KeyPackage;
  privatePackage: PrivateKeyPackage;
}

export async function createIdentity(name: string, cs: CiphersuiteImpl): Promise<Identity> {
  const credential: Credential = { credentialType: "basic", identity: enc.encode(name) };
  const kp = await generateKeyPackage(credential, defaultCapabilities(), defaultLifetime, [], cs);
  return { name, publicPackage: kp.publicPackage, privatePackage: kp.privatePackage };
}

export function startGroup(groupId: string, creator: Identity, cs: CiphersuiteImpl): Promise<ClientState> {
  return createGroup(enc.encode(groupId), creator.publicPackage, creator.privatePackage, [], cs);
}

/** Adds members in one commit. Existing members other than the committer must process `commit`. */
export async function addMembers(state: ClientState, joiners: KeyPackage[], cs: CiphersuiteImpl) {
  const proposals: Proposal[] = joiners.map((keyPackage) => ({ proposalType: "add", add: { keyPackage } }));
  const res = await createCommit({ state, cipherSuite: cs }, { extraProposals: proposals });
  return { state: res.newState, welcome: res.welcome as Welcome, commit: res.commit };
}

export function acceptWelcome(welcome: Welcome, me: Identity, ratchetTree: ClientState["ratchetTree"], cs: CiphersuiteImpl) {
  return joinGroup(welcome, me.publicPackage, me.privatePackage, emptyPskIndex, cs, ratchetTree);
}

export async function encryptText(state: ClientState, text: string, cs: CiphersuiteImpl) {
  const res = await createApplicationMessage(state, enc.encode(text), cs);
  return { state: res.newState, message: res.privateMessage };
}

export async function decryptText(state: ClientState, message: PrivateMessage, cs: CiphersuiteImpl) {
  const res = await processPrivateMessage(state, message, emptyPskIndex, cs);
  if (res.kind !== "applicationMessage") throw new Error(`expected application message, got ${res.kind}`);
  return { state: res.newState, text: dec.decode(res.message) };
}

/**
 * 32-byte SFrame key for the group's current epoch. Every member derives the
 * same bytes without sending them anywhere; a membership change starts a new
 * epoch and therefore a new key.
 */
export async function sframeKey(state: ClientState, cs: CiphersuiteImpl): Promise<{ epoch: bigint; key: Uint8Array }> {
  const epoch = state.groupContext.epoch;
  const ctx = enc.encode(epoch.toString());
  const key = await mlsExporter(state.keySchedule.exporterSecret, SFRAME_LABEL, ctx, 32, cs);
  return { epoch, key };
}

export interface MlsBenchResult {
  members: number;
  suite: CiphersuiteName;
  keyPackagesMs: number;
  addAllMs: number;
  joinAllMs: number;
  encryptMs: number;
  decryptMs: number;
  keysMatch: boolean;
  roundTripOk: boolean;
}

/** Simulates an `n`-member voice channel inside one JS context and times each MLS step. */
export async function runMlsBench(n: number, suite: CiphersuiteName = DEFAULT_SUITE): Promise<MlsBenchResult> {
  const now = () => performance.now();
  const cs = await loadSuite(suite);

  let t = now();
  const ids = await Promise.all(Array.from({ length: n }, (_, i) => createIdentity(`user${i}`, cs)));
  const keyPackagesMs = now() - t;

  const [owner, ...rest] = ids as [Identity, ...Identity[]];
  let ownerState = await startGroup("bench-channel", owner, cs);

  t = now();
  const added = await addMembers(ownerState, rest.map((r) => r.publicPackage), cs);
  ownerState = added.state;
  const addAllMs = now() - t;

  t = now();
  const others = await Promise.all(rest.map((r) => acceptWelcome(added.welcome, r, ownerState.ratchetTree, cs)));
  const joinAllMs = now() - t;

  const ownerKey = await sframeKey(ownerState, cs);
  const otherKeys = await Promise.all(others.map((s) => sframeKey(s, cs)));
  const keysMatch = otherKeys.every((k) => k.epoch === ownerKey.epoch && equalBytes(k.key, ownerKey.key));

  t = now();
  const sent = await encryptText(ownerState, "selam ekip", cs);
  const encryptMs = now() - t;

  t = now();
  const received = others.length ? await decryptText(others[0]!, sent.message, cs) : { text: "selam ekip" };
  const decryptMs = now() - t;

  return {
    members: n,
    suite,
    keyPackagesMs,
    addAllMs,
    joinAllMs,
    encryptMs,
    decryptMs,
    keysMatch,
    roundTripOk: received.text === "selam ekip",
  };
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
