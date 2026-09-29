import { createHash } from "node:crypto";
import { appendFile, copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY = "Altria1979/pokotype";
const TARGETS = {
  "aarch64-apple-darwin": { platform: "macos-aarch64", bundle: "dmg", extension: "dmg" },
  "x86_64-apple-darwin": { platform: "macos-x86_64", bundle: "dmg", extension: "dmg" },
  "x86_64-pc-windows-msvc": { platform: "windows-x86_64", bundle: "nsis", extension: "exe" },
};
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export function validateVersion(version) {
  if (typeof version !== "string" || !SEMVER.test(version)) {
    throw new Error("Desktop version must be a valid semantic version, e.g. 0.1.0-beta.1.");
  }
  return version;
}

export function versionFromTag(tag) {
  if (typeof tag !== "string" || !tag.startsWith("desktop-v")) {
    throw new Error("Desktop release tags must start with desktop-v.");
  }
  return validateVersion(tag.slice("desktop-v".length));
}

export async function writeVersionOverride(version, runNumber, directory) {
  validateVersion(version);
  if (typeof runNumber !== "string" || !/^[1-9]\d*$/.test(runNumber)) {
    throw new Error("GITHUB_RUN_NUMBER must be a positive integer for the macOS bundle build version.");
  }
  const infoPlist = path.resolve(directory, "desktop-info.plist");
  const config = path.resolve(directory, "desktop-tauri-config.json");
  const coreVersion = version.split(/[+-]/)[0];
  // Tauri merges this plist after its defaults; keep the full SemVer in app metadata.
  await writeFile(infoPlist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleShortVersionString</key><string>${coreVersion}</string>
</dict></plist>
`);
  await writeFile(config, `${JSON.stringify({
    version,
    bundle: { macOS: { bundleVersion: runNumber, infoPlist } },
  })}\n`);
  return config;
}

export function requireNativeAcceptance(tag, acceptedTag, acceptanceUrl) {
  versionFromTag(tag);
  if (acceptedTag !== tag) {
    throw new Error(`Native acceptance is missing for ${tag}. Test the Mac and Windows installers, record the results, then set the repository variable DESKTOP_NATIVE_ACCEPTANCE_TAG to this exact tag and re-run the failed publish job.`);
  }
  let url;
  try {
    url = new URL(acceptanceUrl);
  } catch {
    throw new Error("Set DESKTOP_NATIVE_ACCEPTANCE_URL to the HTTPS URL of the Mac and Windows native acceptance record before publishing.");
  }
  if (url.protocol !== "https:" || url.username || url.password || /[\r\n<>]/.test(acceptanceUrl)) {
    throw new Error("DESKTOP_NATIVE_ACCEPTANCE_URL must be an HTTPS URL without credentials.");
  }
  return url.href;
}

function assetName(version, target) {
  return `Pokotype_${validateVersion(version)}_${target.platform}.${target.extension}`;
}

export function expectedAssetNames(version) {
  return Object.values(TARGETS).map((target) => assetName(version, target)).sort();
}

export async function verifyAssets(directory, version) {
  const expected = expectedAssetNames(version);
  const entries = await readdir(directory, { withFileTypes: true });
  const actual = entries.map((entry) => entry.name).sort();
  if (entries.some((entry) => !entry.isFile()) || JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected exactly three desktop installers: ${expected.join(", ")}. Found: ${actual.join(", ")}.`);
  }
  return Promise.all(expected.map(async (name) => {
    const file = path.join(directory, name);
    const { size } = await stat(file);
    if (size === 0) throw new Error(`Installer is empty: ${name}.`);
    const digest = `sha256:${createHash("sha256").update(await readFile(file)).digest("hex")}`;
    return { name, file, size, digest };
  }));
}

export async function stageAsset(root, targetTriple, version, destination) {
  const target = TARGETS[targetTriple];
  if (!target) throw new Error("Unsupported desktop target.");
  const directory = path.join(root, "src-tauri", "target", targetTriple, "release", "bundle", target.bundle);
  const installers = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(`.${target.extension}`));
  if (installers.length !== 1) throw new Error(`Expected one ${target.extension} installer for ${targetTriple}; found ${installers.length}.`);
  const source = path.join(directory, installers[0].name);
  if ((await stat(source)).size === 0) throw new Error("Built installer is empty.");
  await mkdir(destination, { recursive: true });
  const filename = assetName(version, target);
  await copyFile(source, path.join(destination, filename));
  return filename;
}

export function releaseNotes(version, acceptanceUrl) {
  return `Pokotype Desktop ${version} — 公开测试版

下载适合系统与处理器的安装包：

| 安装包 | 平台 |
| --- | --- |
| \`Pokotype_${version}_macos-aarch64.dmg\` | Mac Apple Silicon（M 系列） |
| \`Pokotype_${version}_macos-x86_64.dmg\` | Mac Intel |
| \`Pokotype_${version}_windows-x86_64.exe\` | Windows x64（NSIS 安装程序） |

本版未正式签名：Mac 只有 ad-hoc 临时签名，未使用 Developer ID 签名和 Apple 公证；Windows 未使用发行证书签名。系统可能显示安全提示或阻止安装，不保证无提示安装。

基础练习、内置内容及已保存文章支持离线使用。AI 功能需要网络及用户自己的 API 密钥，直连官方接口。

桌面版数据独立保存，与浏览器数据不互通。首版不提供账号同步、网页数据迁移或应用内自动更新。更新时请退出应用，再下载安装新版；保留应用数据，不要手动删除数据目录。

[Mac 与 Windows 原生验收记录](<${acceptanceUrl}>)
`;
}

export function verifyUploadedAssets(uploaded, expected) {
  if (uploaded.length !== expected.length) throw new Error("Draft release has an unexpected number of assets; it will remain unpublished.");
  for (const asset of expected) {
    const remote = uploaded.find((item) => item.name === asset.name);
    if (!remote || remote.state !== "uploaded" || remote.size !== asset.size || (remote.digest && remote.digest !== asset.digest)) {
      throw new Error(`Uploaded installer did not verify: ${asset.name}. The release will remain a draft.`);
    }
  }
}

// Only the final PATCH makes a release public. Any interrupted upload leaves a draft.
export async function publishRelease({ tag, version, assets, acceptanceUrl }, request) {
  if (versionFromTag(tag) !== version) throw new Error("Release tag and installer versions do not match.");
  const prefix = `/repos/${REPOSITORY}`;
  let release;
  for (let page = 1; ; page++) {
    const releases = await request("GET", `${prefix}/releases?per_page=100&page=${page}`);
    release = releases.find((item) => item.tag_name === tag);
    if (release || releases.length < 100) break;
  }
  if (release && !release.draft) throw new Error("This tag already has a public release; refusing to replace published installers.");

  const metadata = { tag_name: tag, name: `Pokotype Desktop ${version}`, body: releaseNotes(version, acceptanceUrl), prerelease: true, draft: true, make_latest: "false" };
  if (!release) {
    release = await request("POST", `${prefix}/releases`, metadata);
  } else {
    const existing = await request("GET", `${prefix}/releases/${release.id}/assets?per_page=100`);
    if (existing.some((asset) => !assets.some((expected) => expected.name === asset.name))) {
      throw new Error("The existing draft has unrelated assets; refusing to remove them.");
    }
    for (const asset of existing) await request("DELETE", `${prefix}/releases/assets/${asset.id}`);
    await request("PATCH", `${prefix}/releases/${release.id}`, metadata);
  }

  for (const asset of assets) {
    await request("POST", `https://uploads.github.com/repos/${REPOSITORY}/releases/${release.id}/assets?name=${encodeURIComponent(asset.name)}`, await readFile(asset.file));
  }
  const uploaded = await request("GET", `${prefix}/releases/${release.id}/assets?per_page=100`);
  verifyUploadedAssets(uploaded, assets);
  return request("PATCH", `${prefix}/releases/${release.id}`, { draft: false, prerelease: true, make_latest: "false" });
}

function githubRequest(token) {
  return async (method, endpoint, body) => {
    const binary = Buffer.isBuffer(body);
    const response = await fetch(endpoint.startsWith("https:") ? endpoint : `https://api.github.com${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body === undefined ? {} : { "Content-Type": binary ? "application/octet-stream" : "application/json" }),
      },
      ...(body === undefined ? {} : { body: binary ? body : JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`GitHub API ${method} failed with HTTP ${response.status}; the release was not published by this step.`);
    return response.status === 204 ? undefined : response.json();
  };
}

async function main(command) {
  const env = process.env;
  const root = process.cwd();
  if (command === "prepare") {
    const configuration = JSON.parse(await readFile(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"));
    const version = env.GITHUB_REF_TYPE === "tag" && env.GITHUB_REF_NAME?.startsWith("desktop-v")
      ? versionFromTag(env.GITHUB_REF_NAME)
      : validateVersion(configuration.version);
    if (env.DESKTOP_VERSION && env.DESKTOP_VERSION !== version) throw new Error("Build version differs from the checks job.");
    if (!env.RUNNER_TEMP || !env.GITHUB_OUTPUT) throw new Error("prepare runs inside GitHub Actions and requires RUNNER_TEMP and GITHUB_OUTPUT.");
    const config = await writeVersionOverride(version, env.GITHUB_RUN_NUMBER, env.RUNNER_TEMP);
    await appendFile(env.GITHUB_OUTPUT, `version=${version}\nconfig=${config}\n`);
    console.log(`Desktop build version: ${version}`);
    return;
  }
  const version = validateVersion(env.DESKTOP_VERSION);
  const directory = path.join(root, "desktop-dist");
  if (command === "stage") {
    console.log(await stageAsset(root, env.DESKTOP_TARGET, version, directory));
    return;
  }
  if (command !== "verify" && command !== "publish") throw new Error("Usage: node scripts/desktop-release.mjs prepare|stage|verify|publish");
  const assets = await verifyAssets(directory, version);
  if (command === "verify") {
    console.log(`Verified ${assets.length} nonempty desktop installers for ${version}.`);
    return;
  }
  if (env.GITHUB_EVENT_NAME !== "push" || env.GITHUB_REF_TYPE !== "tag" || env.GITHUB_REPOSITORY !== REPOSITORY) {
    throw new Error(`Publishing requires a tag push in ${REPOSITORY}.`);
  }
  const acceptanceUrl = requireNativeAcceptance(env.GITHUB_REF_NAME, env.DESKTOP_NATIVE_ACCEPTANCE_TAG, env.DESKTOP_NATIVE_ACCEPTANCE_URL);
  if (!env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is required to publish.");
  const result = await publishRelease({ tag: env.GITHUB_REF_NAME, version, assets, acceptanceUrl }, githubRequest(env.GITHUB_TOKEN));
  console.log(`Published complete pre-release: ${result.html_url}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
