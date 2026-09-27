# Pokotype

日语打字练习。**从五十音到文章，一点点敲进日语。**

Next.js App Router + React + TypeScript，静态导出，无需账号或后端。米白纸感界面采用顶部导航，以电脑键盘练习为主；手机可浏览文章和设置。

## 功能

- 简体中文、English、日本語三语系统界面，独立静态网址及语言切换。
- 平假名／片假名，按行选择清音、浊音、半浊音与拗音，20／50 题练习和错项强化。
- 多路径罗马音判定：`shi/si`、`chi/ti`、`tsu/tu`、促音、拗音、小假名和上下文「ん」。
- 3 篇原创示例文章；逐句练习、中文翻译、假名提示和读音修正。
- 使用**每位用户自己的 DeepSeek 或阿里百炼密钥**生成主题文章，可选择模型或输入模型 ID，支持 N5–N1 和三档篇幅。
- 本地文章库、成绩、正确率、有效练习时间和易错假名统计。
- 清脆机械按键音；完成假名和文章句子后的日语朗读，可独立开关和调整音量。

## 界面与本地样式 Skill

视觉参考 [Petrichor 宣传页](https://petrichor.wl.do/)的颗粒纸面、墨黑宋体标题、细分割线和胶囊按钮，保留 Pokotype 品牌。纹理使用本地生成的静态 PNG，五层饱和胶囊与页尾波峰由本地 CSS 绘制；日文与罗马音字形不覆盖噪点。标题、导航与页头介绍采用系统宋体字体栈，输入区保持清晰的正体等宽罗马音，不下载参考站点的字体或插图。

- [Pokotype Paper Style](.agents/skills/pokotype-paper-style/SKILL.md)：本项目的颜色、排版、导航、练习区、组件状态与响应式规范。修改界面时优先读取，可在支持项目级 Skills 的工具中使用 `$pokotype-paper-style`。
- [UI Sift](.agents/skills/ui-sift/SKILL.md)：Ciao1019 发布的通用界面设计与重构 Skill，用作方法参考，并非 Petrichor 专属主题。按 [MIT 许可](.agents/skills/ui-sift/LICENSE)保留原始包及其必要引用资源，固定到 [`e4e547d9b3fbf22d138a8f7f04c83e9a816011d7`](https://github.com/Ciao1019/ui-sift/tree/e4e547d9b3fbf22d138a8f7f04c83e9a816011d7)；版本和文件校验值见 [UPSTREAM.json](.agents/skills/ui-sift/UPSTREAM.json)。它的资源目录不代表项目需要安装额外组件库。

主题变量集中在 `src/app/globals.css`，组件使用 CSS Modules。页面最大宽度 1472px，桌面左右 64px、手机 24px；一级标题桌面 72px、手机 44px。页面滚动超过 16px 后，顶部导航收为距视口顶部 12px、最大宽度 1160px 的胶囊；900px 以下保留折叠菜单和 Esc 焦点返回。调整主题仍需保留首页与独立五十音练习页、存储字段、输入判定与暂停行为，手机以浏览和设置为主。

纸纹素材 `public/paper-grain.png` 为确定性 256×256 RGBA 灰度噪点，alpha 为 153（60%）。在项目根目录可复现：

```sh
node scripts/generate-paper-grain.mjs
```

页面通过 `--paper-texture` 与 `background-blend-mode: overlay` 使用纸面材质；装饰先绘制柔边与径向淡出，再叠加颗粒。五层胶囊按 `0 / -35 / 0 / +35 / 0` 度交错。指针跟随仅用于支持 hover 的桌面精细指针；触屏、减少动态效果、装饰离开视口或窗口失焦时保持静止。粉、桃、米、蓝的颗粒波峰页尾提供 AI 生成弹窗和示例文章入口，练习时隐藏。

当前实现范围与最新验收见 [纸面与颗粒返工记录](docs/paper-rework.md)。[初版记录](docs/paper-redesign.md)的测试结果仅为历史功能检查；旧视觉评分 94/pass 已作废，不作为本轮视觉通过的证据。这些 Skill 是开发资料，不参与应用运行或静态导出；项目无需新依赖。

## 本地运行

需要 Node.js 20.19 或更新版本，推荐 Node.js 22 LTS。

```sh
npm ci
npm run dev
```

打开终端显示的本地地址，默认 `http://localhost:3000`。端口被占用时 Next.js 会显示实际使用的端口。

## 构建与静态预览

```sh
npm run build
npm run preview
```

打开 `http://127.0.0.1:4173`。构建产物位于 `out/`，可以交给支持目录 `index.html` 的静态服务。此项目不使用 `next start`。部署到根域名时无需额外配置；部署到 GitHub Pages 的仓库子路径时，需配置相应 `basePath` 后重新构建。

### Vercel 部署

[GitHub 仓库](https://github.com/Altria1979/pokotype)已连接到 Vercel，`main` 为生产分支，后续推送会自动构建并部署到 [pokotype.vercel.app](https://pokotype.vercel.app)。仓库内的 `vercel.json` 固定使用 `npm ci` 安装依赖、`npm run build` 构建，以及 `out/` 作为静态输出目录。

在 Vercel 的 Production 环境中设置 `SITE_URL` 为实际生产域名（包含 `https://`），以生成正确的 canonical、hreflang 和 sitemap。部署不需要设置 DeepSeek 或阿里百炼密钥；用户在浏览器中自行配置自己的密钥。

`.gitignore` 和 `.vercelignore` 排除本地环境变量、凭据、IDE 配置、代理日志及测试产物。发布前仍需检查新增文件，不要将真实密钥写入源码、示例配置或 `NEXT_PUBLIC_*`。

## 页面地址与多语言

页面使用 `/zh-CN/`、`/en/`、`/ja/` 三种语言前缀：

- `/<locale>/`：五十音练习设置页。
- `/<locale>/practice/?session=<本轮标识>`：五十音答题页。
- `/<locale>/articles/`：我的文章库，支持原页 AI 生成弹窗。
- `/<locale>/history/`：练习记录。
- `/<locale>/settings/`：设置。

旧无前缀地址仍可打开，按已保存语言、浏览器语言、简体中文的顺序选择目标；旧 `/generate/` 转入文章库。带前缀 URL 始终决定当前语言。入口页提供无 JavaScript 时可用的三语链接，不依赖服务器重定向。

桌面语言入口位于页头，手机位于导航菜单。切换保留当前路径、查询参数和锚点。练习（包含暂停与结果页）、编辑、生成窗口、未保存设置、连接检查及未落盘数据会锁定语言入口；保存或退出后解除。保存失败的文章、成绩或偏好可通过“重试保存”再次写入，关闭提示不会丢弃这些数据。

文章原文、假名、罗马音、用户内容与现有中文释义保持原语言；界面切换不会改变 AI 写作提示词。三语共用本地文章、成绩、设置和密钥，语言偏好独立存入 `pokotype:locale:v1`。

练习会话仅保存在当前页面内存中：刷新、直接打开答题地址或前进到已结束的会话都会返回当前语言的设置页，不恢复进度；配置和已完成记录仍保留。

发布构建须设置正式站点 URL，例如 `SITE_URL=https://your-domain.example npm run build`。配置后生成三语 canonical、hreflang，以及仅包含首页和文章库的 `out/sitemap.xml`；练习会话、历史、设置和跳转页不索引。未配置时，本地构建省略绝对 SEO 链接及 sitemap，不使用虚构域名。

实现约定与验收方法见 [多语言说明](docs/internationalization.md)。

## 使用 AI 生成文章

1. 「设置」同时显示 **DeepSeek API 密钥** 和 **阿里百炼 API 密钥** 两张卡片，可分别保存、清除或点击「检查连接」。百炼接入北京地域，请使用对应地域的按量付费密钥。输入框有内容时检查该密钥，留空则检查已保存密钥；检查草稿不会自动保存。
2. 检查成功后点击卡片下的「查看模型列表」，可在弹窗中上下滚动浏览该服务返回的模型 ID 和数量，草稿密钥也能查看。DeepSeek 和百炼均会把已保存密钥的检查结果同步到设置页及生成弹窗的选项；先检查草稿再保存同一密钥也会同步，无需重复检查。未检查时提供内置预设，也可填写自定义模型 ID。各服务分别记住模型。百炼目录含不同用途的模型，文章生成请选择支持文本对话的模型。
3. 在「我的文章库」点击「生成新文章」，弹窗中可直接切换服务和模型，再选择主题、等级和篇幅。生成后自动加入文章库，当前页面不跳转；也可主动查看文章、检查读音后开始练习。首页和页尾入口同样原页打开弹窗。

| 服务 | 模型名称 | 请求 model |
| --- | --- | --- |
| DeepSeek | V4.1 Flash（默认） | `deepseek-flash` |
| DeepSeek | V4 Flash 兼容别名，目前指向 V4.1 Flash | `deepseek-v4-flash` |
| 阿里百炼 | Qwen3.8 Flash（默认） | `qwen3.8-flash` |
| 阿里百炼 | Qwen3.7 Flash | `qwen3.7-flash` |

上表为未获取列表时的预设。检查连接只验证模型列表接口鉴权，不保证余额充足或所有模型具备生成权限；不发起文章生成请求。列表仅缓存于当前页面会话，密钥改变后失效。

模型 ID 依据：[DeepSeek 官方模型表](https://api-docs.deepseek.com/quick_start/pricing/)、[Qwen3.7 Flash](https://help.aliyun.com/zh/model-studio/qwen3-7-flash)、[Qwen3.8 Flash](https://help.aliyun.com/zh/model-studio/qwen3-8-flash)。自定义 ID 的可用性取决于所选平台及密钥权限，应用不会自动切换模型。

浏览器只直接请求对应官方端点：DeepSeek 为 `https://api.deepseek.com/chat/completions`；百炼为 `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`。输出使用非思考 JSON 模式，并校验每句的日文、假名和译文。无需 `.env`，密钥不能放到 `NEXT_PUBLIC_*` 或源码中。调用消耗用户自己的额度；取消请求只停止客户端等待，不保证服务方免除已产生费用。请求不自动重试或改用另一家密钥。

密钥分开保存在当前浏览器 localStorage，可单独替换、清除。旧 DeepSeek 配置无需迁移。该存储不加密，避免在共享电脑保留密钥。文章、成绩和统计保存在 IndexedDB；清除网站数据或更换浏览器后不会同步恢复。AI 服务/模型偏好与练习偏好分开保存。

## 输入约定

- 使用英文输入法，按照假名书写形式输入：助词「は／へ／を」对应 `ha/he/wo`。
- 「ー」使用 `-`，标点自动跳过；错误按键不推进，无需退格。
- 首次正确输入开始计时；按 Esc、切换标签页或窗口失焦暂停，点击继续恢复。
- 正确率 = 正确按键数 ÷ 全部有效尝试；速度 = 每分钟正确按键数，并非英文词数 WPM。
- 「ん」在句末输入 `n` 即完成；在元音或 y 前需要 `nn` 或 `n'` 消歧。独立假名题完整输入后，先按朗读设置发音，再进入下一题。
- 未完成的练习不记为完成记录；错项强化使用已完成练习中的假名统计。

### 随时查阅输入规则

五十音设置、文章预览和练习工具栏都提供「输入规则」。练习中打开说明会立即暂停，关闭后仍保持暂停，需点击「继续练习」恢复；说明中的按键不会影响作答、计时或成绩。支持 Esc 关闭、Tab 切换焦点，关闭后焦点返回原入口。

Pokotype 按照假名**书写形式**判定，不是按助词发音判定：助词「は／へ／を」虽读作 `wa/e/o`，输入仍为 `ha/he/wo`，例如「私は」输入 `watashiha`。输入规则说明覆盖以下常见情况：

| 规则 | 示例 |
| --- | --- |
| 多种拼写 | `shi/si`、`chi/ti`、`tsu/tu`、`ji/zi`；提示只展示当前合法路径，也接受其他合法拼写 |
| 促音 | 「きって」→ `kitte`，「ざっし」→ `zasshi`；单独「っ」可用 `xtu/ltu/xtsu/ltsu` |
| 小假名、拗音与浊音 | 「ゃ」→ `xya/lya`，「しゃ」→ `sha/sya`，不是 `shia`；「ちゅ」→ `chu`，「にゃ」→ `nya`，「が」→ `ga`，「ぴょ」→ `pyo` |
| 拨音 | 「さんま」→ `sanma`，「しんよう」→ `shin'you/shinnyou`，「みんな」→ `minna`；`n-n` 不是合法写法 |
| 连续输入 | 长音符「ー」用 `-`；标点与空白自动跳过，显示的罗马音分组之间无需输入空格，错误后直接继续，无需退格 |

**单独或句末的「ん」在 Pokotype 输入一个 `n` 就会自动完成当前题目或句子，不需继续敲第二个 `n`。** 这是练习器的自动完成行为；日语输入法可能需要 `nn` 或确认操作才能提交「ん」，不要把本应用的题目切换方式当成所有输入法的统一规则。通用罗马字输入可参考[微软官方罗马字／假名输入对应表](https://www.microsoft.com/content/dam/microsoft/final/ja-jp/microsoft-brand/documents/mcaps-atlife-RE4xdJo.pdf)，本应用以说明弹窗中的约定为准。

AI 生成的读音、翻译和 JLPT 分级可能不准确，格式校验不能保证语言语义正确。可在文章预览中修正读音。

## 声音与朗读

在「设置 → 声音与朗读」独立开关按键音、五十音自动朗读、文章分段朗读、文章逐句朗读，并分别调整按键音量和朗读音量。默认四项开启，按键音量为 25%，朗读音量为 80%；支持 0.8×、1.0×、1.2× 语速，以及自然（1.0）和轻快（1.15，默认）音高。试听按钮使用当前音量，即使对应练习开关关闭，也可以试听。

完整输入一个假名后朗读该假名，同时立即进入下一题；快速连打时优先播放最新假名，不等待朗读结束。文章的中间显示分段打完后朗读该段，仍可继续输入；快速完成下一段时以新段为准。完整输入一句时优先朗读整句，包括汉字和标点，不额外重复末段。关闭整句听读、保留分段朗读时，末段也会单独发音并立即切题。分段边界沿用当前罗马音显示分组，支持拗音合并与不同拼写。

文章整句听读期间保留原文，不接受作答、不计打字时间，朗读结束后进入下一句，从首次正确输入恢复计时；按 Enter 可以跳过。暂停、切换窗口、离开页面或关闭对应声音开关时停止播放；整句听读暂停后继续会重新朗读原句，输入中的已完成分段不重复播放。

本轮测试、真实浏览器声音与已知限制见 [音频功能验收](docs/audio-verification.md)。

日语音色来自浏览器和操作系统。自动选择优先本地 Kyoko 女声，不可用时回退到其他日语音色，仍保持本地优先；也可指定标记为「本地」或「在线」的音色，在线音色可能需要联网。音高变化的实际效果取决于设备语音。已保存音色不可用时自动尝试其他日语音色；浏览器不支持朗读或没有日语音色时会给出提示，打字练习仍可继续。声音设置保存在当前浏览器，旧版偏好会补齐声音默认值并保留已有选择。

## 验证

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

如果系统不支持 Playwright 提供的浏览器版本，可指定已安装的 Chrome：

```sh
PLAYWRIGHT_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:e2e
```

端到端测试对 `out/` 静态产物运行，模拟 DeepSeek 和百炼响应，不产生 API 费用。真实服务测试独立执行，不在测试代码或报告中保存密钥；验证结果见 [AI 模型选择记录](docs/ai-model-selection.md) 和 [密钥检查记录](docs/api-key-check.md)。

## 模块

| 目录 | 职责 |
| --- | --- |
| `src/app` | App Router 页面、共享布局和全局主题 |
| `src/components` | 五十音、文章、生成、设置与历史界面 |
| `src/lib/romaji.ts` | 与 React 无关的罗马音状态机 |
| `src/lib/kana.ts` / `session.ts` | 题目生成、有效计时与统计 |
| `src/lib/articles.ts` / `deepseek.ts` / `ai-models.ts` | 文章契约、校验、服务/模型目录和生成 |
| `src/lib/storage.ts` | 有版本的本地持久化和原子记录写入 |
| `src/lib/audio.ts` / `src/components/useBrowserAudio.ts` | 浏览器按键音、日语语音和资源释放 |
| `tests` | 浏览器端到端测试 |

输入体验参考 kanabr 的方向，代码为独立实现，未复制 kanabr 源码。
