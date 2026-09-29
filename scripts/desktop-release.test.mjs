import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  expectedAssetNames,
  publishRelease,
  releaseNotes,
  requireNativeAcceptance,
  stageAsset,
  validateVersion,
  verifyAssets,
  verifyUploadedAssets,
  versionFromTag,
} from "./desktop-release.mjs";

const version = "0.1.0-beta.1";
const tag = `desktop-v${version}`;
const acceptanceUrl = "https://github.com/Altria1979/pokotype/issues/42";

async function temporaryDirectory(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pokotype-release-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function fixtureAssets(t) {
  const directory = await temporaryDirectory(t);
  for (const name of expectedAssetNames(version)) await writeFile(path.join(directory, name), `installer ${name}`);
  return { directory, assets: await verifyAssets(directory, version) };
}

test("versions preserve prereleases and reject malformed or executable tag text", () => {
  for (const valid of ["0.1.0", "1.2.3-beta.1", "2.0.0-rc.0+build.7"]) {
    assert.equal(validateVersion(valid), valid);
    assert.equal(versionFromTag(`desktop-v${valid}`), valid);
  }
  for (const invalid of ["v0.1.0", "01.2.3", "1.2", "1.2.3-beta.01", "1.2.3\n", "1.2.3;echo pwned", "$(id)", "1.2.3/../../x", "1.2.3-", ""]) {
    assert.throws(() => versionFromTag(`desktop-v${invalid}`));
  }
  assert.throws(() => versionFromTag("v0.1.0"));
});

test("publishing needs native acceptance for this exact tag and an HTTPS evidence URL", () => {
  assert.equal(requireNativeAcceptance(tag, tag, acceptanceUrl), acceptanceUrl);
  assert.throws(() => requireNativeAcceptance(tag, undefined, acceptanceUrl), /DESKTOP_NATIVE_ACCEPTANCE_TAG/);
  assert.throws(() => requireNativeAcceptance(tag, "desktop-v0.1.0", acceptanceUrl), /exact tag/);
  for (const invalid of [undefined, "", "not a URL", "http://example.com", "https://user:secret@example.com", "https://example.com\n"]) {
    assert.throws(() => requireNativeAcceptance(tag, tag, invalid), /DESKTOP_NATIVE_ACCEPTANCE_URL/);
  }
});

test("asset verification requires one nonempty installer for each exact platform and version", async (t) => {
  const { directory, assets } = await fixtureAssets(t);
  assert.equal(assets.length, 3);
  assert.ok(assets.every((asset) => asset.size > 0 && /^sha256:[a-f0-9]{64}$/.test(asset.digest)));
  await assert.rejects(verifyAssets(directory, "0.2.0"), /exactly three/);
  await writeFile(path.join(directory, "unexpected.exe"), "extra");
  await assert.rejects(verifyAssets(directory, version), /exactly three/);
  await rm(path.join(directory, "unexpected.exe"));
  await writeFile(assets[0].file, "");
  await assert.rejects(verifyAssets(directory, version), /empty/);
  await rm(assets[0].file);
  await assert.rejects(verifyAssets(directory, version), /exactly three/);
});

test("staging selects only the intended target bundle and refuses ambiguous output", async (t) => {
  const root = await temporaryDirectory(t);
  const output = path.join(root, "desktop-dist");
  const bundles = path.join(root, "src-tauri", "target", "x86_64-pc-windows-msvc", "release", "bundle", "nsis");
  await mkdir(bundles, { recursive: true });
  await writeFile(path.join(bundles, "Pokotype_setup.exe"), "installer");
  assert.equal(await stageAsset(root, "x86_64-pc-windows-msvc", version, output), `Pokotype_${version}_windows-x86_64.exe`);
  await writeFile(path.join(bundles, "another.exe"), "installer");
  await assert.rejects(stageAsset(root, "x86_64-pc-windows-msvc", version, output), /found 2/);
  await assert.rejects(stageAsset(root, "unsupported", version, output), /Unsupported/);
});

function mockGithub(assets, { existing, existingAssets = [], failUpload = false, wrongSize = false } = {}) {
  const calls = [];
  const uploaded = [...existingAssets];
  return {
    calls,
    request: async (method, endpoint, body) => {
      calls.push({ method, endpoint, body });
      if (method === "GET" && endpoint.includes("/releases?")) return existing ? [existing] : [];
      if (method === "POST" && endpoint.endsWith("/releases")) return { id: 7, draft: true };
      if (method === "POST" && endpoint.startsWith("https://uploads.github.com/")) {
        if (failUpload && uploaded.length === 1) throw new Error("Simulated upload interruption");
        const name = new URL(endpoint).searchParams.get("name");
        const asset = assets.find((item) => item.name === name);
        uploaded.push({ ...asset, id: uploaded.length + 1, state: "uploaded", size: asset.size + (wrongSize ? 1 : 0) });
        return uploaded.at(-1);
      }
      if (method === "GET" && endpoint.includes("/assets?")) return uploaded;
      if (method === "DELETE") {
        const index = uploaded.findIndex((asset) => endpoint.endsWith(`/assets/${asset.id}`));
        assert.notEqual(index, -1);
        uploaded.splice(index, 1);
        return;
      }
      if (method === "PATCH") return { id: 7, html_url: "https://github.com/Altria1979/pokotype/releases/tag/desktop-v0.1.0-beta.1" };
      throw new Error(`Unexpected request: ${method} ${endpoint}`);
    },
  };
}

test("publication creates a draft, uploads all installers, verifies, then exposes the pre-release", async (t) => {
  const { assets } = await fixtureAssets(t);
  const github = mockGithub(assets);
  await publishRelease({ tag, version, assets, acceptanceUrl }, github.request);
  const creation = github.calls.find((call) => call.method === "POST" && call.endpoint.endsWith("/releases"));
  assert.equal(creation.body.draft, true);
  assert.equal(creation.body.prerelease, true);
  assert.equal(github.calls.filter((call) => call.endpoint.startsWith("https://uploads.github.com/")).length, 3);
  assert.match(github.calls.at(-2).endpoint, /\/assets\?/);
  assert.deepEqual(github.calls.at(-1).body, { draft: false, prerelease: true, make_latest: "false" });
});

test("an interrupted upload or mismatched asset never makes the draft public", async (t) => {
  const { assets } = await fixtureAssets(t);
  for (const options of [{ failUpload: true }, { wrongSize: true }]) {
    const github = mockGithub(assets, options);
    await assert.rejects(publishRelease({ tag, version, assets, acceptanceUrl }, github.request));
    assert.ok(!github.calls.some((call) => call.body?.draft === false));
  }
});

test("a failed draft can be retried without touching unrelated draft assets", async (t) => {
  const { assets } = await fixtureAssets(t);
  const existing = { id: 7, tag_name: tag, draft: true };
  const github = mockGithub(assets, { existing, existingAssets: [{ ...assets[0], id: 50, state: "starter" }] });
  await publishRelease({ tag, version, assets, acceptanceUrl }, github.request);
  assert.ok(github.calls.some((call) => call.method === "DELETE" && call.endpoint.endsWith("/assets/50")));
  assert.equal(github.calls.at(-1).body.draft, false);
  const unrelated = mockGithub(assets, { existing, existingAssets: [{ name: "other-file.zip", id: 90 }] });
  await assert.rejects(publishRelease({ tag, version, assets, acceptanceUrl }, unrelated.request), /unrelated assets/);
  assert.ok(unrelated.calls.every((call) => call.method === "GET"));
});

test("published releases are immutable and mismatched build versions never call GitHub", async (t) => {
  const { assets } = await fixtureAssets(t);
  const github = mockGithub(assets, { existing: { id: 7, tag_name: tag, draft: false } });
  await assert.rejects(publishRelease({ tag, version, assets, acceptanceUrl }, github.request), /already has a public release/);
  assert.ok(github.calls.every((call) => call.method === "GET"));
  const untouched = mockGithub(assets);
  await assert.rejects(publishRelease({ tag, version: "0.2.0", assets, acceptanceUrl }, untouched.request), /versions do not match/);
  assert.equal(untouched.calls.length, 0);
});

test("uploaded assets must match sizes, states, names and available digests", async (t) => {
  const { assets } = await fixtureAssets(t);
  const uploaded = assets.map((asset) => ({ ...asset, state: "uploaded" }));
  assert.doesNotThrow(() => verifyUploadedAssets(uploaded, assets));
  for (const change of [{ size: 0 }, { state: "starter" }, { digest: "sha256:wrong" }, { name: "wrong.exe" }]) {
    assert.throws(() => verifyUploadedAssets([{ ...uploaded[0], ...change }, ...uploaded.slice(1)], assets));
  }
  assert.throws(() => verifyUploadedAssets(uploaded.slice(1), assets), /number of assets/);
});

test("release notes disclose signing limitations, data isolation, updates, and acceptance evidence", () => {
  const notes = releaseNotes(version, acceptanceUrl);
  for (const expected of ["Apple Silicon", "Intel", "Windows x64", "未正式签名", "阻止安装", "数据独立保存", "自动更新", acceptanceUrl]) {
    assert.ok(notes.includes(expected));
  }
});
