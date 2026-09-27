# 五十音设置与答题导航

`/` 保留原来的五十音设置页；开始普通练习或错项强化，成功生成固定题目后，使用 `router.push` 进入 `/practice/?session=<id>`。设置、答题和结果都选中「五十音练习」。AI 生成继续在原页弹窗中完成。

## 会话与返回

- `DataProvider` 独立维护临时会话（本轮标识、固定题目、普通/强化模式与标题），不写入 localStorage 或 IndexedDB。
- 只有观察到实际进入答题路由后，再离开路由才会清空会话。待跳转阶段与 React StrictMode 的 effect 重放不会清理会话。
- `KanaSession` 校验查询参数，按本轮标识复用 `Practice`。浏览器返回或结束练习都回到原设置页，保留练习偏好，恢复开始按钮焦点；移动端或无可练习范围时使用范围按钮。
- 离开后原 `Practice` 卸载，沿用现有计时、声音和键盘监听清理；未完成的练习不写成绩。
- 刷新、直达无效地址、前进到已失效会话会 `replace` 回 `/`，不恢复进度或自动出题。完成后的成绩仍在本轮地址，沿用 `PracticeRun.advance` 的完成守卫，只保存一次。

## 改动范围

- 恢复 `src/app/page.tsx`，删除误加的介绍页样式及 `/kana/` 页面。
- `src/components/Shell.tsx`、`History.tsx`：恢复四项导航、Logo 与练习入口，并让答题页仍高亮五十音。
- `src/components/DataProvider.tsx`、`KanaPractice.tsx`、新增 `KanaSession.tsx` 与 `src/app/practice/page.tsx`：会话切换和返回焦点。
- 浏览器测试恢复原入口并覆盖历史导航、失效会话、强化、完成与声音清理。

只修改五十音导航，文章练习、AI 弹窗、输入引擎和存储键保持原有行为；未增加依赖。

## 验证

- Lint、TypeScript 检查、193 项单元测试和 Next 静态构建通过。
- 80 项浏览器回归均已获得通过证据。完整初跑 79/80，唯一失败为测试在新答题页加载前读取输入；补齐导航等待后，音频 14/14、输入规则 4/4 复测通过，其余测试已在完整运行中通过。覆盖普通/强化、返回/前进、刷新/直达无效会话、配置与焦点、连续开始、取消待完成导航、成绩只存一次及返回后停声。
- 生产静态路由包含 `/` 和 `/practice/`，已移除 `/kana/`。
- Next 开发模式实测开始 → 浏览器返回 → 再次开始 → 结束 → 前进到失效会话，均正常且无页面错误。
- 1440px、1920px 和 390px 截图检查通过，无横向溢出。截图与开发模式验证数据在 `.omx/artifacts/kana-session-navigation/`，视觉评估在 `.omx/state/kana-session-navigation/ralph-progress.json`。
- 自动化回归使用本机 Chrome；内置浏览器已手测开始后的地址、返回一层和焦点恢复。其他浏览器尚未运行完整回归。
