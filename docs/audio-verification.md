# 打字音效与日语听读验收

日期：2026-09-27。范围：本地实现、静态导出与浏览器验证，未部署网站。

后续按键音已改为短促电子音，并增加真实输出采样。最新实现与验收见 [短促电子按键音修复](key-sound-fix.md)；下文保留最初音频功能的验证记录。

## 行为

- 五十音完成后发音并立即切题，最新发音替换旧发音；最后一题声音可持续到成绩页。
- 文章完成整句后保留原文和译文进行听读，结束或 Enter 跳过只推进一次；暂停后继续重读原句。
- 中间显示分段打完后朗读该段，继续输入不会被阻塞；快速完成下一段时替换旧发音，整句完成时优先读全句。分段与整句开关独立；仅开启分段时，末段单独发音并立即前进。
- 文章听读及下一句首次正确输入前的等待不计时。普通字符在听读中不影响成绩、不触发按键音。
- 设置包含四个独立开关、两种音量、日语音色、三个语速档位和自然 / 轻快音高。自动选择优先本地 Kyoko，轻快音高为 1.15；显式音色选择优先。浏览器偏好仍使用 v1 存储，旧字段保留，新字段按默认值补齐。
- 缺失日语声音、播放失败、启动超时和晚到回调均不会阻塞练习。发音恢复后清除旧错误提示。

## 主要改动文件

| 文件 | 改动 |
| --- | --- |
| `src/lib/audio.ts`、`src/components/useBrowserAudio.ts` | 稳定的浏览器音频控制、日语音色选择、合成机械声、取消与资源释放 |
| `src/lib/practice-run.ts`、`src/components/Practice.tsx`、`src/components/Practice.module.css` | 将输入、听读和计时集中到一个练习状态对象；统一切题入口，避免重复推进或记录成绩 |
| `src/lib/storage.ts` | 音频偏好默认值、逐字段读取兼容及保存校验 |
| `src/components/SoundSettings.tsx`、`src/components/Settings.tsx`、`src/components/Preferences.module.css` | 声音设置、试听和纸感响应式布局 |
| `src/lib/audio.test.ts`、`src/lib/practice-run.test.ts`、`src/lib/storage.test.ts` | 调度、计时、旧数据兼容与错误处理回归 |
| `tests/audio-practice.spec.ts`、`tests/audio-settings.spec.ts` | 可控语音事件和真实界面交互回归 |
| `tests/practice.spec.ts`、`tests/article-grouping.spec.ts` | 原有连续文章输入用例显式关闭听读，保留原验证目标 |

未新增依赖、服务器端接口或共享密钥；使用现有存储和罗马音引擎。音频资源独立于普通重渲染，练习切题统一由带索引校验的入口负责。

## 自动化结果

- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm test`：9 个测试文件，193 项通过。
- `npm run build`：静态导出成功。
- Chrome 静态产物全量浏览器回归：60 项通过，日志位于 `.omx/artifacts/segment-audio/browser.log`。
- 语音模拟覆盖自然结束、错误、取消后晚到事件、缺失 API、延迟音色、独立开关、音量语速、暂停恢复与唯一成绩记录。
- 1440、1920、390 宽度的设置页无横向溢出；1440 文章听读截图保留原文与清晰的跳过入口。截图位于 `.omx/artifacts/audio/`，视觉核对记录位于 `.omx/state/audio/ralph-progress.json`。
- 新增分段边界完成、拗音合并与拆分、模糊 n 重归属不重复发音、分段开关持久化、暂停取消、快速打字时整句优先、开关不误停另一类发音、Kyoko 优先和音高传递测试。新版截图及原生播放证据位于 `.omx/artifacts/segment-audio/`，视觉核对位于 `.omx/state/segment-audio/ralph-progress.json`。

## 真实浏览器验证

在 macOS 上使用 Google Chrome 154.0.8037.57 打开静态预览，未替换原生 TTS：

- 日语列表实际包含 Hattori、Kyoko、O-Ren，均标记为本地语音。
- 选择 Kyoko、1.0× 语速，点击试听日语并输入示例文章第一句，均收到真实 `start` / `end` 事件，页面无错误。
- 试听首次启动约 440ms；示例句「私は毎朝七時に起きて、部屋の窓を開けます。」启动约 25ms，朗读约 4.1 秒后自动进入第二句。这些是本次设备上的测量值，不是性能保证。
- 证据位于 `.omx/artifacts/audio/native-check.json`。另实际点击了按键试听；合成节点、音量和释放由自动化测试覆盖。

分段与音高增量再次使用同一 Chrome 版本验证：自动选择实际命中 Kyoko，音高约 1.15（浏览器浮点回读值为 1.149999976）；「私は」「毎朝七時に起きて、」及完整第一句均收到原生 start / end，整句结束自动进入下一句。当前用户预览页也已通过设置控件选中 Kyoko，并确认轻快音高、分段与整句开关开启。详细事件记录见 `.omx/artifacts/segment-audio/native-check.json`。

以 10ms 按键间隔快速输入第二句时，旧分段按预期收到 interrupted / canceled，最终完整句收到 start / end，并正确进入第三句，没有错误提示或过期事件重复切题。原生测试没有页面异常；播放事件证明调用和切换正常，不代表人工评定的声音风格。

## 限制

声音列表与启动延迟取决于访客浏览器和系统，部署不会把本机 Kyoko 提供给所有设备。在线音色可能需要网络。无日语声音时提示并允许继续练习。

本轮真实播放验证针对 macOS Chrome + Kyoko；其他声音仅确认可枚举，Safari、Firefox、Windows 和 Android 未做真实播放验证。未进行人工音质或日语韵律评分，不能把播放事件测试视为发音准确性的人工评审。
