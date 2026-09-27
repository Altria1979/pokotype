# 原页 AI 文章生成

AI 生成合并为弹窗功能，主导航保留五十音练习、我的文章库、练习记录和设置。文章库「生成新文章」、首页推荐卡片、页尾「用 AI 写一篇」均在当前页面打开同一套生成表单。

选择主题（含自定义）、日语等级和篇幅后生成。成功时文章直接加入文章库，显示保存状态；用户可以关闭弹窗留在原页，或主动点击「查看文章」。旧 `/generate/` 书签兼容替换到文章库，不再展示独立生成页面。

## 改动与简化

- `src/components/Generate.tsx`、`Generate.module.css`：复用原生成逻辑与原生 dialog 模式；去掉整页标题、装饰预览、步骤栏。新增关闭/Esc/历史导航中止、焦点循环与恢复、背景滚动锁、生成结果与仅重试保存。
- `src/components/Articles.module.css`：删除独立生成页及右侧说明栏的闲置样式；表单样式归入弹窗。
- `src/components/Shell.tsx`：移除 AI 导航，把现有 DataProvider 覆盖范围扩到 footer，使各入口共用文章数据。
- `src/components/Articles.tsx`、`KanaPractice.tsx`、`KanaPractice.module.css`、`PaperFooter.tsx`：导航链接换成原页弹窗按钮。
- `src/components/DataProvider.tsx`：文章保存返回持久化是否成功，保留先更新内存、写入失败仍保留内容的行为。
- `src/components/Settings.tsx`、`src/app/generate/page.tsx`、`README.md`：更新入口提示、旧地址兼容和使用说明。
- `tests/generation-dialog.spec.ts`：新增生成、取消、重试保存、手机布局、键盘、历史导航回归。
- `tests/failures.spec.ts`、`practice.spec.ts`、`navigation.spec.ts`、`paper-style.spec.ts`、`kana-home.spec.ts`：迁移入口与选择器，保留既有行为断言。

未新增依赖；密钥仍由用户提供，API 请求与本地存储结构沿用现有实现。

## 验证

- 改动前：193 项单元测试与 3 项失败恢复浏览器测试通过。
- 改动后：Lint、TypeScript、193 项单元测试与 Next 静态构建通过。
- 全量浏览器回归首次 67/68 通过；剩余一项是旧 `button.primary` 选择器因页尾也成为按钮而多匹配，改为语义选择器后通过。
- 最终补跑弹窗 11 项与上述选择器回归，覆盖跨路径和仅 query 的 Back/Forward、请求实际 abort、无密钥/空自定义主题、双向 Tab、保存失败只重试持久化、刷新后的文章保留。
- 查看 1440px 桌面、390px 手机参数与成功截图；检查横屏/低高度弹窗滚动和背景锁定。视觉评估 94/100，页面无运行错误、无横向溢出。

证据在 `.omx/artifacts/generation-dialog/`，视觉评估在 `.omx/state/generation-dialog/ralph-progress.json`。成功状态截图使用隔离浏览器和模拟文章响应，不会向用户文章库插入测试数据。浏览器验证使用本机 Chrome，AI 响应通过拦截模拟；未消耗真实 DeepSeek 额度，未验证本次外部服务可用性。
