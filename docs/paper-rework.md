# Pokotype 纸面与颗粒返工

## iPhone 全站纸纹修复（2026-09-30）

用户新一轮真机截图显示整页底色已恢复，但练习卡片、浮动导航、选音卡、页尾行动区、生成弹窗和设置仍出现浓重灰色雪花。全局将 `background-blend-mode` 设为 `normal` 可以在真实静态页面中复现这些区域的异常，桌面缩窄窗口本身不能复现。

根因是普通表面仍将 60% 透明度的高对比灰度纹理作为背景，再依靠 `overlay` 转成浅纸色。前次提交只替换了 `body`；此前 207 项浏览器检查通过的历史记录有效，但其兼容性测试只采样页面边缘，不能证明组件内部正常。

本轮排查全部纹理入口并删除 12 处普通背景混合声明。画布与所有普通面板、练习设置、API 卡片、规则弹窗标题、文章阅读页脚、生成长度选项和页尾行动区使用预合成纸纹。分别生成浅绿选中态、灰米／浅绿／浅橙封面和浅色菜单素材；浮动导航素材保留原背景与纹理合成后的半透明度。共享 `.panel` 和 `dialog` 同时覆盖历史、练习结果、设置与模型列表弹窗。无布局、输入引擎、API、存储或依赖变更。

两处彩色装饰继续使用隔离伪元素的 `mix-blend-mode`，这是与普通 `background-blend-mode` 不同的绘制路径；用户真机截图中的页尾渐变仍正常。原始素材变量改为装饰专用的 `--paper-art-texture`，普通表面不得复用。`node scripts/generate-paper-grain.mjs` 一次生成原始纹理和全部语义底色素材。

验收覆盖全局背景混合失效时组件内部的实际像素、选中颜色、导航、手机菜单与弹窗，并在 390px、1440px、1920px 比较正常混合的旧版参考。自动化失效模拟不等同于 iPhone 真机验收；本机 macOS 13 不受当前 Playwright WebKit 运行时支持。本轮验证：lint、类型检查、414 项单元测试和静态构建通过；全套 219 项浏览器用例中 217 项首轮通过，另外 2 项因并行校验共享报告目录导致收尾失败，隔离报告后重跑全部通过。最终加强后的 12 项纹理像素回归再次通过，额外验证实际色相、与语义底色的均值差和颗粒起伏。没有遗留产品断言失败。

31 组界面／视口组合在 390px、1440px、1920px 下没有横向溢出或页面脚本错误。全局禁用背景混合前后，28 组截图完全一致，其余 3 组仅有 1–2 个原生控件边缘像素不同；所有纸面内部正常。与旧版正常混合的参考截图相比，确定性界面的平均通道差为 0.002–0.069/255，练习题目的随机字形不计入该数值。独立 visual-verdict 为 98/pass，截图和对比记录位于本地 `/tmp/pokotype-surface-fix/`，判定保存于 `.omx/state/paper-surfaces/ralph-progress.json`。

重复生成全部 8 张素材的 SHA-256 一致，原始灰度和彩色装饰所用素材、此前生成的米白画布素材均未变化。静态导出中的 7 种预合成素材字节与源文件一致，编译后 CSS 没有 `background-blend-mode` 声明。

## 修改前的清理计划

1. 保留现有业务与回归测试；本次只动主题、装饰、布局与导航。
2. 用可复现的 256×256 静态灰度 PNG 替换低透明 SVG，删除旧纹理文件与双重透明度。统一纸面材质，不向文字层加噪点。
3. 重做五层胶囊、柔边与受限指针动效；收紧假名预览，让开始按钮在桌面首屏可达。
4. 增加滚动胶囊导航和颗粒渐变页尾，保留菜单焦点与暂停逻辑。
5. 同视口检查纹理强度、全部页面与弹窗，跑类型、Lint、单元、静态构建及浏览器回归；随后更新 Skill 和验收证据。

## 参考与边界

视觉参考：https://petrichor.wl.do/ 。来源站仅作为材质、颜色、排版和滚动状态参考；本地代码与图形自行实现。沿用系统字体，不使用许可未核实的字体。无新依赖、Git、发布、API 或存储结构变更。

此前的功能检查不能证明视觉接近。初版纸纹对比度只有参考的约八分之一，初版视觉通过结论作废，本次用同视口截图和纸面灰度统计重新验收。

## 已完成的修改

| 文件 | 修改与简化 |
| --- | --- |
| `src/app/globals.css` | 纸纹与装饰色统一为语义变量，标题 72px/44px，正文与字形保持清晰；移除弱化的全屏伪元素 |
| `public/paper-grain.png`、`scripts/generate-paper-grain.mjs` | 确定性 256×256 RGBA 灰度噪声，alpha153，以 overlay 混合；删除旧 `paper-grain.svg`，不再叠加第二层透明度 |
| `src/components/PaperArt.tsx/.module.css` | 五层交错胶囊、饱和渐变、径向淡出与复合颗粒；只接受桌面鼠标，收敛停止 RAF，离屏、失焦、触控与减少动态效果时静止 |
| `src/components/Shell.tsx/.module.css` | 1472px 内容宽度、64px/24px 边距；scrollY>16 后 top12/max1160 胶囊；短横屏菜单可内部滚动，锚点避开导航 |
| `src/components/PaperFooter.tsx/.module.css` | 纸色混合的粉桃米蓝波峰，真实生成和示例入口，正式练习时隐藏 |
| `src/components/KanaPractice.tsx/.module.css` | 横向假名示范，矮屏紧凑布局，开始按钮在 1440×800、1440×900、1920×1080 首屏可见 |
| `Articles.module.css`、`Preferences.module.css`、`Practice.module.css`、`InputRulesHelp.module.css`（均在 `src/components/`） | 去掉覆盖共享材质的背景简写，统一纸面、分隔线、标题和弹窗，保留分组与高亮 |
| `tests/navigation.spec.ts`、`tests/paper-style.spec.ts` | 导航滚动、键盘焦点、短横屏、页尾入口、图片解码、指针与减少动态效果回归 |
| `README.md`、项目 Paper Style Skill、`docs/paper-redesign.md` | 更新维护规范，将初版视觉结论标记为失效的历史记录 |

所有改动限于本地。业务引擎、计分、API、文章与存储结构未修改；未新增依赖，项目仍无 `.git`。

## 验收结果（2026-09-27）

- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm test`：149 项通过，7 个测试文件。
- `npm run build`：通过，静态 `out/` 包含全部页面。
- `PLAYWRIGHT_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:e2e`：29 项通过。
- 以静态预览服务验证所有页面，39 张本地最终状态截图和 9 张参考状态截图。覆盖 1440、1920、390px，页面顶部、滚动导航、页尾、规则弹窗、五十音结果、文章分组输入和有记录的历史；页面错误与 console.error 均为 0，整页横向溢出为 0。
- 回归覆盖文章预览与读音编辑、保存副本和删除、刷新恢复、暂停/继续、规则内按键不作答、密钥清除，以及模拟生成成功与失败恢复。均未调用付费真实 API。
- 追加修正了 667×375 菜单末项被裁切、正文锚点被固定导航遮挡，以及混合输入设备上的触摸/笔事件边界。

### 纸纹采样

相同 Chromium、DPR=1、缩放100%，从同坐标无内容纸面截取像素，使用每像素 RGB 均值的标准差衡量明暗起伏，没有缩放截图或把文字/边框计入采样。

| 视口宽度 | 参考标准差 | Pokotype 标准差 | 相对误差 |
| --- | ---: | ---: | ---: |
| 1440 | 5.243 | 5.176 | 1.29% |
| 1920 | 5.243 | 5.176 | 1.29% |
| 390 | 5.174 | 5.123 | 1.00% |

误差小于约20%的目标。数字仅描述空白纸面的颗粒对比度，不代表整个网站的像素相似率。独立 visual-verdict 为92/pass；已通过的图形仍与参考有可见细节差异，不宣称完全一致。

### 证据与截图

完整证据位于 [paper-rework 本地目录](../.omx/artifacts/paper-rework/)。

- [初版首页](../.omx/artifacts/paper-rework/before-kana-1440.png) → [新版首页](../.omx/artifacts/paper-rework/after-top-1440.png)
- [参考页头](../.omx/artifacts/paper-rework/reference-top-1440.png) / [新版页头](../.omx/artifacts/paper-rework/after-top-1440.png)
- [参考页尾](../.omx/artifacts/paper-rework/reference-footer-1440.png) / [新版页尾](../.omx/artifacts/paper-rework/after-footer-1440.png)
- [文章练习](../.omx/artifacts/paper-rework/after-article-practice-1440.png) / [手机文章预览](../.omx/artifacts/paper-rework/after-article-preview-390.png) / [手机输入规则](../.omx/artifacts/paper-rework/after-input-rules-390.png)
- [浏览器状态和错误记录](../.omx/artifacts/paper-rework/browser-check.json) / [纸纹统计](../.omx/artifacts/paper-rework/texture-comparison.json) / [最终视觉判断](../.omx/artifacts/paper-rework/verdict-final.json)

截图使用隔离浏览器，数据为自动化练习产生的本地记录；未读取或覆盖日常浏览器中的文章、成绩和密钥。`.omx/` 是本地验收资料，不进入静态产物。

## 剩余差异与维护边界

使用系统宋体，字形和跨操作系统的字体回退不会与官网专用字体逐像素一致。紧凑页头中，蓝色胶囊左端和粉紫胶囊右端比参考稍清晰；中央颗粒与颜色保留。当前自动化验证使用本机 Chrome/Chromium，未运行其他浏览器的截图矩阵。

纹理不逐帧更新；维护时避免重新引入透明度叠乘，或把噪点放到文字之上。预合成纸面的颜色变更须同步修改生成脚本并切换匹配的图片，不能只改 `background-color`；避免 `background` 简写擦掉共享纹理。新增装饰不得进入正在练习的阅读中心。
