# 搜索发现与收录

站点保留静态导出。SEO 描述已有免费练习和原创内容，不自动发布用户文章、生成结果、成绩或 API 密钥。

## 公开入口

- `/ja/`、`/zh-CN/`、`/en/`：五十音与罗马音练习、入门说明和示例阅读入口。
- `/{locale}/articles/`：交互文章库，以及不依赖 JavaScript 的原创示例介绍与链接。
- `/{locale}/articles/sample-morning/`、`sample-station/`、`sample-library/`：独立的静态阅读页，包含原文、假名和中文译文，可进入现有文章练习。

每个公开页面有独立标题、描述、自指 canonical 和三语互链 hreflang，`x-default` 为日语。练习会话、历史、设置、生成跳转页及无语言前缀的兼容页面保持 `noindex, follow`。robots 允许抓取这些页，使搜索引擎能够读取 noindex。

首页 JSON-LD 描述真实的 WebSite 和 WebApplication，不包含虚构评分、评论或搜索接口。Open Graph / Twitter 卡片使用构建时生成的 `social-preview.png`，无需运行时服务或外部字体请求。

## 域名与构建

`src/lib/site.ts` 集中生成绝对地址，默认正式域名为 `https://pokotype.vercel.app`。预览构建也指向该规范站点；部署到独立域名时，必须在构建前覆盖 `SITE_URL`，例如：

```sh
SITE_URL=https://your-domain.example npm run build
```

该变量不能包含凭证、查询参数或片段。它只配置 SEO 地址，不配置 Next.js 的 basePath；本项目仍按域名根目录部署。

`src/app/robots.ts` 与 `src/app/sitemap.ts` 使用 Next.js 原生静态元数据路由，生成 `out/robots.txt` 和 `out/sitemap.xml`。Sitemap 从现有原创示例列表生成，共 15 个可索引 URL，不包含查询参数、个人内容或虚构更新时间。

## 验收

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

`tests/seo.spec.ts` 直接检查静态响应中的元信息、所有 sitemap URL、语言互链、noindex 和图片响应，并在关闭 JavaScript 后读取三语说明和所有示例全文。`src/lib/site.test.ts` 覆盖域名默认值、覆盖值和 URL 校验。

部署后检查 `/robots.txt`、`/sitemap.xml` 和公开页面返回 200，确认正式域名与 canonical 一致。不要只看客户端导航后的 DOM。

## 搜索平台提交

代码发布本身不等于搜索平台已收录。站点所有者可在 [Google Search Console](https://search.google.com/search-console) 和 [Bing Webmaster Tools](https://www.bing.com/webmasters/) 中验证站点，提交 `https://pokotype.vercel.app/sitemap.xml`，再使用 URL 检查工具查看首页和示例阅读页的抓取情况。更换域名时提交新域名下的 sitemap。

本次代码不含站长平台验证令牌，也不会伪造提交成功状态。收录时间和排名由搜索引擎决定；后续可根据真实查询、曝光和点击数据继续完善有用内容。

维护依据：[JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)、[多语言页面](https://developers.google.com/search/docs/specialty/international/localized-versions)、[Sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)、[结构化数据规则](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)。
