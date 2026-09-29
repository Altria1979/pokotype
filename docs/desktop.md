# Pokotype 桌面版

桌面版用 Tauri 2 加载 Next.js 静态产物，复用网页版的练习引擎、三语界面和本地存储。安装后无需 Node.js 服务。网页版的开发、构建和部署流程继续保留。

## 下载、安装与更新

唯一下载入口是 [Pokotype GitHub Releases](https://github.com/Altria1979/pokotype/releases)。选择带 `desktop-v` 标签的 Pre-release，并在附件中选择对应平台：

| 平台 | 安装包 | 安装方式 |
| --- | --- | --- |
| macOS Apple Silicon（arm64） | `.dmg` | 打开磁盘映像，将 Pokotype 拖入「应用程序」 |
| macOS Intel（x64） | `.dmg` | 选择 Intel 包，拖入「应用程序」 |
| Windows x64 | `.exe` | 运行安装程序，按向导安装到当前用户 |

当前 Mac 构建要求 macOS 13.3 或更高版本。Windows 面向 Windows 10 / 11 x64，使用系统 WebView2；缺少运行时时，安装程序需联网下载。首次安装完成后，基础练习不需要网络。请以 Release 实际附件和该版本说明为准；没有附件表示尚无可下载的桌面发布包，README 中的入口不代表已经发布。

首版是**未正式签名的公开测试版**。Mac 仅使用临时签名，没有 Developer ID 签名与 Apple 公证；Windows 没有发行签名。Gatekeeper、SmartScreen 或设备管理策略可能提示、阻止安装或启动，不能保证无提示安装。遇到拦截时请保留系统提示并反馈，不要关闭系统安全保护。签名方式见 [Tauri macOS 文档](https://v2.tauri.app/distribute/sign/macos/)和 [Windows 文档](https://v2.tauri.app/distribute/sign/windows/)。

首版通过手动安装更新：退出 Pokotype，下载适合同一平台的新版本并覆盖安装。在 Mac 上关闭窗口只会隐藏窗口，更新前请使用菜单退出或 `Cmd+Q`。正常退出重开与保留数据的覆盖升级应保留已保存文章、设置和练习记录；卸载时清除应用数据、手工清理数据目录或更改操作系统账户，可能导致数据丢失，重新安装不会从云端恢复。未完成练习只存在内存中，退出或刷新后不会续练。正式签名、公证和应用内自动更新留待后续版本。

## 本地数据与联网范围

- 网页与桌面版使用各自独立的存储空间，不自动搬迁文章、记录、设置或密钥；三种界面语言在同一应用内共用数据。开发模式与正式安装包也不应视为同一份数据。
- 假名练习、内置文章和已经保存的文章可离线练习。按键音在本机生成；日语朗读由系统提供，在线音色可能需要联网，没有可用音色仍可打字练习。
- AI 连接检查、模型列表和文章生成需要网络，使用用户自己的 DeepSeek 或阿里百炼密钥，只请求相应服务的官方 API。安装包不包含共享密钥，也没有用户数据后端。
- 密钥沿用应用的 localStorage 存储，未加密，不是系统钥匙串。可在设置页清除。反馈问题时不要附上密钥。
- 外部链接由系统默认浏览器打开，应用内继续保留当前练习和页面；切换窗口时仍按已有规则暂停练习。

## 开发与本机打包

准备 Node.js 20.19+ 与 npm、通过 rustup 管理的 Rust 工具链和对应平台的编译环境：仓库的 `rust-toolchain.toml` 固定 Rust **1.98.1**，同时包含 clippy 和 rustfmt；Mac 使用 Xcode 命令行工具；Windows 使用 Visual Studio 的 C++ 构建工具及 WebView2。完整平台安装要求以 [Tauri 2 官方文档](https://v2.tauri.app/start/prerequisites/)为准。桌面封装通过 `src-tauri/` 配置，使用 `out/` 中的静态文件，符合 [Tauri 的 Next.js 集成方式](https://v2.tauri.app/start/frontend/nextjs/)。

在项目根目录运行：

```sh
npm ci
npm run desktop:dev
```

开发命令启动 Next.js 开发服务与原生窗口。正式包嵌入本地静态文件，不依赖开发服务器。当前窗口最小宽度为 960px，练习使用实体键盘与英文输入模式。

```sh
# 重新生成已有品牌图标
npm run desktop:icon

# 构建当前系统的应用和安装包，自动先构建静态页面
npm run desktop:build
```

Mac 与 Windows 安装包分别在对应操作系统中构建，不能把在 Mac 上运行一次构建当作 Windows 验证。需要显式目标时，先安装对应 Rust target，再执行：

```sh
# 在 Mac 上构建 Apple Silicon 包
rustup target add aarch64-apple-darwin
npm run desktop:build -- --target aarch64-apple-darwin --bundles dmg

# 在 Mac 上构建 Intel 包
rustup target add x86_64-apple-darwin
npm run desktop:build -- --target x86_64-apple-darwin --bundles dmg

# 在 Windows 上构建 x64 安装程序
rustup target add x86_64-pc-windows-msvc
npm run desktop:build -- --target x86_64-pc-windows-msvc --bundles nsis
```

安装包位于 `src-tauri/target/release/bundle/`；指定 `--target` 时位于 `src-tauri/target/<target>/release/bundle/`。本地 `.app` 能启动不代表 `.dmg` 或 `.exe` 的实际安装已验收。

## GitHub Actions 与发布

工作流 **Desktop builds and releases** 支持 Pull Request、手动 `workflow_dispatch` 和 `desktop-v*` 标签。PR 和手动执行只构建、不公开发布，可从对应 Actions run 的 Artifacts 下载三份安装包用于验收。

1. 先运行网页检查：lint、类型检查、单元测试、静态构建与针对静态产物的浏览器测试。
2. Mac Apple Silicon、Mac Intel、Windows x64 独立构建与检查原生代码，各上传一个安装包。任何平台失败，均不进入发布。
3. 标签触发时，发布任务检查版本和三份附件，并确认同一标签的原生验收记录已提供。先上传到草稿并校验附件，再公开为 Pre-release，避免公开不完整版本。
4. 发布任务使用 Actions 自带 `GITHUB_TOKEN` 的 `contents: write` 权限，其他任务只有读取权限。不需要把个人 GitHub token 或 AI 密钥写入仓库。

发布标签例如 `desktop-v0.1.0-beta.1`；去掉 `desktop-v` 的部分作为本次桌面版本，工作流生成构建版本覆盖配置，无需为每个测试版手工改写网页包版本。

应用版本和安装包文件名保留完整版本（例如 `0.1.0-beta.1`），Windows NSIS 也用完整版本识别 `beta.1` 到 `beta.2` 的升级。Mac 的系统元数据使用数字格式：`CFBundleShortVersionString` 为 `0.1.0`，`CFBundleVersion` 使用该工作流的正整数 `GITHUB_RUN_NUMBER`；同一次运行重试不会改变构建号。工作流将临时 Info.plist 的绝对路径传给 Tauri，在默认 plist 生成后覆盖短版本字段。这个处理符合 [Apple 的版本字段格式](https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundleversion)，不改变应用标识、数据目录或手动覆盖安装方式。

首次发布前先将桌面工作流合入仓库默认分支，再从已合入的提交创建版本标签。若发布目标相对默认分支还含有工作流文件变更，GitHub 的 [Release API](https://docs.github.com/en/rest/releases/releases#create-a-release) 可能要求 `GITHUB_TOKEN` 无法获得的工作流写权限，返回 403 或 404。保持从默认分支的已合入提交发布，无需额外个人 token。

首次公开版本前必须完成下方的真实安装验收，并在仓库 **Settings → Secrets and variables → Actions → Variables** 设置：

| 变量 | 内容 |
| --- | --- |
| `DESKTOP_NATIVE_ACCEPTANCE_TAG` | 本次通过原生验收的完整标签，必须精确等于发布标签，例如 `desktop-v0.1.0-beta.1` |
| `DESKTOP_NATIVE_ACCEPTANCE_URL` | 公开的 HTTPS 验收记录链接，例如 GitHub Issue；记录对应提交、平台和结果，不包含密钥 |

只有完成实际验收后才能填写这两个变量。先推标签获取该版本的安装包也是可行流程：缺少验收记录时发布任务会明确失败，构建产物仍可从 Actions 下载；验证这批安装包并填写变量后，在**原标签的同一个 Actions run** 中选择 **Re-run failed jobs**，只重跑发布任务。如果产物已超过保存期限，重新运行全部任务并再次核对实际安装包。不要沿用其他标签的验收结论，也不要用浏览器测试结果代替原生验收。

每份 Release 说明应包含版本、平台架构、未正式签名提示、手动更新和数据保留说明，以及本次原生验收记录链接。下载入口始终指向 Releases 列表，用户可查看各版本与已知问题。

## 验收清单

以下是发布要求，不代表已经执行或通过。每次验收记录操作系统版本、CPU 架构、安装包版本、对应 Git 提交和结果；对不支持的系统或失败项目明确说明，不填写假结果。

| 场景 | 检查内容 |
| --- | --- |
| 安装与启动 | Mac arm64、Intel 与 Windows x64 的对应包可安装、启动、退出；记录签名拦截或所需运行时 |
| 路由与窗口 | 日／中／英三语切换，首页、文章、记录、设置导航与刷新可用；菜单、外部链接、窗口最小尺寸正常 |
| 打字与输入法 | 实体键盘练习五十音和文章；英文输入正常，输入法组合输入不误计；别名拼写和「ん」仍正确 |
| 暂停与声音 | 切换窗口自动暂停，主动暂停／继续、结束操作正确；按键音和日语朗读可用，无日语音色时可继续练习 |
| 网络与 AI | 两家服务使用测试者自己的密钥，验证连接检查、模型列表、生成、取消及失败提示；日志和截图不含密钥 |
| 离线 | 断网后冷启动，练习假名、内置文章和已保存文章；AI 不可用时有清晰错误且本地内容不丢失 |
| 重启与升级 | 保存文章、设置并完成一轮练习，退出重开后仍存在；在保留应用数据的前提下覆盖安装新版本，再确认内容和记录 |
| 存储隔离 | 浏览器、桌面版各自保存文章与设置，不相互覆盖；桌面三语切换不丢失同一应用内的内容 |

基础代码检查：

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run desktop:check
```

浏览器自动化使用模拟 AI 响应；真实桌面 WebView 的声音、输入法、网络权限、CORS、安装和升级仍需原生测试记录。升级测试要使用两个可识别的版本，保持应用标识和用户数据目录不变。首次发布可用内部验收构建验证升级路径，但不能把尚未执行的测试写成已通过。
