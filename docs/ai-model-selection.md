# AI 服务与模型选择

设置页和 AI 生成弹窗现在可选择 DeepSeek / 阿里百炼及模型。两个入口同步选择，记住每家上次使用的模型；自定义模型 ID 不会被静默替换。默认仍为 DeepSeek `deepseek-flash`，已有密钥无需迁移。

## 模型与请求

- DeepSeek V4.1 Flash：`deepseek-flash`。
- DeepSeek V4 Flash 兼容别名：`deepseek-v4-flash`，官方已将其路由到 V4.1 Flash。
- 阿里百炼：`qwen3.8-flash`（该服务默认）与 `qwen3.7-flash`。
- 自定义 ID：只能包含字母、数字及 `._:-`，最多 128 字符；实际是否可调用由平台和账户权限决定。生成采用非思考 JSON 模式，自定义模型也需支持这些参数。

只访问官方固定端点，拒绝 HTTP 重定向，不提供任意代理 URL。DeepSeek 发送 `thinking: {type: "disabled"}`，百炼发送 `enable_thinking: false`；两家共用文章 JSON 校验、90 秒超时、取消、保存及错误脱敏逻辑。没有自动重试或跨服务降级。

百炼接入华北 2（北京）按量付费接口 `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`。新旧按量付费密钥均可使用，密钥地域须匹配；其他地域和订阅计划本轮未接入。

依据：[DeepSeek 模型表](https://api-docs.deepseek.com/quick_start/pricing/)、[DeepSeek 思考模式](https://api-docs.deepseek.com/guides/thinking_mode/)、[Qwen3.7 Flash](https://help.aliyun.com/zh/model-studio/qwen3-7-flash)、[Qwen3.8 Flash](https://help.aliyun.com/zh/model-studio/qwen3-8-flash)、[百炼 Base URL](https://help.aliyun.com/zh/model-studio/base-url)、[百炼结构化输出](https://help.aliyun.com/zh/model-studio/qwen-structured-output)。

## 本地数据

- DeepSeek 密钥沿用 `pokotype:api-key:v1`。
- 百炼密钥使用 `pokotype:api-key:bailian:v1`。
- 服务与各家模型单独保存于 `pokotype:ai-settings:v1`，只写入白名单字段，不混入密钥或接口地址。
- 同页通过成功保存后的通知同步 AI 选择；跨标签页通过 `storage` 事件同步。生成期间保持当前请求的服务和模型。
- 浏览器存储失败显示错误，已有文章和练习偏好不受影响。

## 修改文件

- `src/lib/ai-models.ts`：模型目录、官方端点、ID 校验与默认设置。
- `src/lib/deepseek.ts`：扩展原生成函数以支持两家服务和所选模型。
- `src/lib/storage.ts`：独立密钥、模型偏好、成功写入后的同步通知。
- `src/components/AiModelFields.tsx`：复用的服务／模型选择字段。
- `src/components/Settings.tsx`、`Generate.tsx`：设置入口、生成入口及状态同步。
- `src/lib/deepseek.test.ts`、`src/lib/ai-storage.test.ts`、`tests/ai-model-selection.spec.ts`：请求、存储和用户流程回归。
- `README.md`：使用方式与模型名称。

没有增加依赖、后端、共享密钥或新的生成页面；请求层和表单字段由两家服务复用。

## 真实服务验证（2026-09-27）

使用用户授权的密钥，在独立、临时 Chrome 浏览器中由实际静态页面直连百炼。每个模型请求一次，结束后关闭该浏览器；不保存密钥到源码、脚本或报告。

| 模型 | HTTP | 请求耗时 | 完成状态 | 文章校验／保存／刷新 |
| --- | --- | --- | --- | --- |
| `qwen3.7-flash` | 200 | 约 6.4 秒 | stop | 全部通过 |
| `qwen3.8-flash` | 200 | 约 3.9 秒 | stop | 全部通过 |

响应 model 与请求一致。原始响应和密钥未记录，脱敏结果位于 `.omx/artifacts/ai-model-selection/live-smoke.json`。DeepSeek 本轮使用模拟请求验证，不消耗真实 DeepSeek 额度。

## 自动化与界面验证

- ESLint、TypeScript 检查及 Next 静态构建通过。
- 259 项单元测试全部通过，包括服务/模型请求参数和独立密钥存储。
- Chrome 对最终静态产物的完整浏览器回归 96/96 通过，其中 11 项为本轮新增 AI 选择回归。
- 额外验证两标签页的服务/模型双向同步、逐字输入自定义 ID 时保持焦点、1440px/390px 布局无横向溢出。
- 独立审查发现并修复了自定义 ID 命中预设时失焦、同页设置旧快照覆盖弹窗选择两项问题，复核未发现新的阻断问题。
- visual-verdict 最终通过（94/100）。源码、文档及构建产物的百炼密钥前缀扫描未发现密钥。

界面截图和脱敏测试报告位于 `.omx/artifacts/ai-model-selection/`；视觉评估位于 `.omx/state/ai-model-selection/ralph-progress.json`。实际服务验证与完整自动化使用本机 Chrome；其他浏览器未单独实测。
