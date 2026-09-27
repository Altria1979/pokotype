# README screenshots

Captured on **2026-09-27** from the local static preview of [Pokotype](https://github.com/Altria1979/pokotype), using a fresh browser context for each language.

These are screenshots of the working application, not mockups. They reflect the local build at capture time, including pending UI changes, so a later release may look different.

| View | 简体中文 | 日本語 | English |
| --- | --- | --- | --- |
| Kana home | [zh-CN-home.jpg](zh-CN-home.jpg) | [ja-home.jpg](ja-home.jpg) | [en-home.jpg](en-home.jpg) |
| Article preview and practice modes | [zh-CN-article.jpg](zh-CN-article.jpg) | [ja-article.jpg](ja-article.jpg) | [en-article.jpg](en-article.jpg) |
| Full-article practice | [zh-CN-practice.jpg](zh-CN-practice.jpg) | [ja-practice.jpg](ja-practice.jpg) | [en-practice.jpg](en-practice.jpg) |
| AI generation dialog | [zh-CN-ai.jpg](zh-CN-ai.jpg) | [ja-ai.jpg](ja-ai.jpg) | [en-ai.jpg](en-ai.jpg) |

## Capture settings

- Tool: the application's existing Playwright installation with Google Chrome.
- Viewport: 1440 × 900, device scale factor 1, reduced motion enabled.
- Format: JPEG, quality 88. The article preview captures the entire `main` element; other images capture the viewport.
- Languages: `/zh-CN/`, `/ja/`, `/en/`.
- Article: the built-in original sample `sample-morning` (「小さな朝の習慣」).
- No API keys, personal articles or practice history were loaded. The AI dialog was opened without submitting a generation request.

## Refreshing the screenshots

1. In the application source repository, run `npm ci`, `npm run build` and `npm run preview`.
2. Open `http://127.0.0.1:4173/<locale>/` in a fresh browser context with the settings above and capture the home view.
3. Open `/<locale>/articles/?id=sample-morning`, wait for the start button, and capture `main` with the article and all three practice modes visible.
4. Start the default full-article practice mode and capture the initial typing screen.
5. Open `/<locale>/articles/`, click the create-article button, and capture the dialog. Leave credentials empty and do not submit.
6. Repeat for all three languages, review the images for clipping and private data, then keep the existing filenames so the README links continue to work.
