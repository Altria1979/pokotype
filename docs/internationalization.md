# 三语界面

采用 next-intl 与 App Router 静态预生成，语言固定为 `zh-CN`、`en`、`ja`。保留静态导出，不使用 Proxy、运行时 Cookie 或服务器用户数据。

## 文案维护

- 字典位于 `src/i18n/messages/<locale>/<namespace>.json`。先定义稳定语义 key，再补齐三语；每个语言的 `index.ts` 导出相同 namespaces。
- 动态文案使用 ICU 参数和复数；富文本使用 `t.rich`。模型、假名分类、模式等业务值不随语言改变。
- 界面通过 `useTranslations`，预生成页面通过 `getTranslations` 使用字典。每个页面只向客户端传递当前语言消息。
- 日期按当前语言与浏览器时区显示；日语学习文本标注 `lang="ja"`，保留的中文文章译文标注 `lang="zh-CN"`。
- 领域错误继承 `AppError`，提供稳定 `code`、安全插值参数及兼容旧测试的诊断 message；界面经 `useErrorMessage` 格式化，不展示未知异常或服务商原始响应。
- 新假名成绩使用可选 `kanaPracticeMode`。旧记录中的两个系统假名标题在展示时映射，不改写存量数据或文章标题，不升级 IndexedDB 版本。

## 路由与保护

内部链接和跳转从 `src/i18n/navigation.ts` 导入。语言切换只替换 locale 路径段，保留 query/hash 并 replace 当前历史项。无前缀兼容入口在浏览器中跳转，并保留三语 HTML 链接。

组件使用 `useLocaleBlock(reason, active)` 注册未完成操作。语言入口在任意阻塞原因存在时禁用，显示原因。该机制只保护语言切换，不拦截地址栏、刷新或其他既有导航行为。

DataProvider 按文章、成绩和偏好追踪未落盘写入。失败后保留内存及重试函数，提示关闭与待保存状态独立；再次保存成功才解除保护。练习状态不跨语言快照恢复。

## 构建与验收

正式部署在构建时设置 `SITE_URL` 为 HTTP(S) 站点 URL。首页和文章库生成 canonical、三语 hreflang 及 sitemap；本地未配置时不产生绝对 SEO 链接和 sitemap。使用支持目录 index.html 的静态主机部署完整 `out/`。

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

浏览器测试针对静态导出。若本机没有 Playwright Chromium，可通过项目已有的 `PLAYWRIGHT_EXECUTABLE_PATH` 指向安装的 Chrome。

消息测试检查 namespaces、key、ICU 参数与富文本标签一致，并实际格式化所有消息。多语言浏览器测试覆盖直达刷新、语言选择优先级、链接参数、不可用存储、练习与编辑保护、保存失败重试、旧成绩兼容和移动导航。原中文回归改为直接访问 `/zh-CN/`，不依赖测试浏览器默认语言。
