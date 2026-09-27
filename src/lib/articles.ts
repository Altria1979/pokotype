import { canTypeReading } from "./romaji";
import { AppError } from "../i18n/errors";

export type Segment = { text: string; reading: string };
export type Sentence = { segments: Segment[]; translation: string };
export type Article = {
  id: string;
  title: string;
  sentences: Sentence[];
  level: string;
  topic: string;
  createdAt: string;
  source: "sample" | "ai";
};

export function sentenceReading(sentence: Sentence): string {
  return sentence.segments.map((segment) => segment.reading).join("");
}

export function sentenceText(sentence: Sentence): string {
  return sentence.segments.map((segment) => segment.text).join("");
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(
  value: unknown,
  max: number,
  label: string,
  code: string,
  values?: Record<string, string | number>,
): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new AppError(code, `${label}为空或过长，请重新生成或修正。`, values);
  }
  return value.trim();
}

const punctuationOnly = /^[\p{P}\p{Z}\s]+$/u;
const readingCharacters =
  /^[\p{Script=Hiragana}\p{Script=Katakana}ー\p{P}\p{Z}\s]+$/u;

/** Validates both AI responses and user-edited readings before they reach practice. */
export function validateArticleContent(value: unknown): {
  title: string;
  sentences: Sentence[];
} {
  if (!record(value)) throw new AppError("ArticleErrors.invalid", "文章格式无效，请重新生成。");
  const title = boundedText(value.title, 120, "文章标题", "ArticleErrors.title");
  if (
    !Array.isArray(value.sentences) ||
    value.sentences.length === 0 ||
    value.sentences.length > 80
  ) {
    throw new AppError("ArticleErrors.sentenceCount", "文章需包含 1–80 个句子。");
  }
  let totalLength = 0;
  const sentences = value.sentences.map((item, sentenceIndex): Sentence => {
    const label = `第 ${sentenceIndex + 1} 句`;
    const values = { sentence: sentenceIndex + 1 };
    if (
      !record(item) ||
      !Array.isArray(item.segments) ||
      item.segments.length === 0 ||
      item.segments.length > 80
    ) {
      throw new AppError("ArticleErrors.segments", `${label}分段格式无效。`, values);
    }
    const translation = boundedText(item.translation, 2000, `${label}翻译`, "ArticleErrors.translation", values);
    const segments = item.segments.map((part): Segment => {
      if (!record(part)) throw new AppError("ArticleErrors.segments", `${label}分段格式无效。`, values);
      const text = boundedText(part.text, 1000, `${label}原文`, "ArticleErrors.text", values);
      totalLength += text.length;
      if (typeof part.reading !== "string" || part.reading.length > 2000) {
        throw new AppError("ArticleErrors.readingFormat", `${label}读音格式无效。`, values);
      }
      const reading = part.reading.normalize("NFC").trim();
      if (!reading && punctuationOnly.test(text)) return { text, reading: "" };
      if (
        !reading ||
        !readingCharacters.test(reading) ||
        !canTypeReading(reading)
      ) {
        throw new AppError(
          "ArticleErrors.reading",
          `${label}读音需为可输入的假名，汉字与数字请填写假名读音。`,
          values,
        );
      }
      return { text, reading };
    });
    const sentence = { translation, segments };
    if (!canTypeReading(sentenceReading(sentence)))
      throw new AppError("ArticleErrors.noKana", `${label}没有可练习的假名。`, values);
    return sentence;
  });
  if (totalLength > 5000) throw new AppError("ArticleErrors.tooLong", "文章过长，请缩短至 5000 字以内。");
  return { title, sentences };
}

const segment = (text: string, reading: string): Segment => ({ text, reading });
const sentence = (translation: string, ...segments: Segment[]): Sentence => ({
  translation,
  segments,
});

export const SAMPLE_ARTICLES: Article[] = [
  {
    id: "sample-morning",
    title: "小さな朝の習慣",
    level: "N5",
    topic: "日常",
    source: "sample",
    createdAt: "2026-01-01T00:00:00.000Z",
    sentences: [
      sentence(
        "我每天早上七点起床，打开房间的窗户。",
        segment("私は", "わたしは"),
        segment("毎朝七時に起きて、", "まいあさしちじにおきて、"),
        segment("部屋の窓を開けます。", "へやのまどをあけます。"),
      ),
      sentence(
        "在厨房喝温热的茶，吃面包。",
        segment("台所で", "だいどころで"),
        segment("温かいお茶を飲んで、", "あたたかいおちゃをのんで、"),
        segment("パンを食べます。", "ぱんをたべます。"),
      ),
      sentence(
        "去学校之前，在笔记本上写三个新的日语单词。",
        segment("学校へ行く前に、", "がっこうへいくまえに、"),
        segment("新しい日本語の言葉を", "あたらしいにほんごのことばを"),
        segment("三つノートに書きます。", "みっつのーとにかきます。"),
      ),
      sentence(
        "虽然只有一点点时间，但这是我喜欢的早晨习惯。",
        segment("少しの時間ですが、", "すこしのじかんですが、"),
        segment("私の好きな", "わたしのすきな"),
        segment("朝の習慣です。", "あさのしゅうかんです。"),
      ),
    ],
  },
  {
    id: "sample-station",
    title: "海へ向かう電車",
    level: "N4",
    topic: "旅行",
    source: "sample",
    createdAt: "2026-01-01T00:00:00.000Z",
    sentences: [
      sentence(
        "星期天的早晨，我和朋友在车站碰面。",
        segment("日曜日の朝、", "にちようびのあさ、"),
        segment("友達と駅で", "ともだちとえきで"),
        segment("待ち合わせをしました。", "まちあわせをしました。"),
      ),
      sentence(
        "买好车票，坐上了沿着海边行驶的小电车。",
        segment("切符を買って、", "きっぷをかって、"),
        segment("海の近くを走る", "うみのちかくをはしる"),
        segment("小さな電車に乗りました。", "ちいさなでんしゃにのりました。"),
      ),
      sentence(
        "从窗外能看到白色的船和蓝色的天空，不禁笑了起来。",
        segment("窓の外に", "まどのそとに"),
        segment("白い船と青い空が見えて、", "しろいふねとあおいそらがみえて、"),
        segment("思わず笑顔になりました。", "おもわずえがおになりました。"),
      ),
      sentence(
        "到达下一个车站后，我们打算找一家咖啡馆。",
        segment("次の駅に着いたら、", "つぎのえきについたら、"),
        segment("喫茶店を探す", "きっさてんをさがす"),
        segment("つもりです。", "つもりです。"),
      ),
    ],
  },
  {
    id: "sample-library",
    title: "雨の日の図書館",
    level: "N3",
    topic: "校园",
    source: "sample",
    createdAt: "2026-01-01T00:00:00.000Z",
    sentences: [
      sentence(
        "下午开始下雨了，所以我决定在图书馆度过一段时间。",
        segment(
          "午後から雨が降り始めたので、",
          "ごごからあめがふりはじめたので、",
        ),
        segment(
          "図書館でしばらく過ごすことにしました。",
          "としょかんでしばらくすごすことにしました。",
        ),
      ),
      sentence(
        "在靠窗的座位上打开书，雨声听起来仿佛柔和的音乐。",
        segment("窓際の席で本を開くと、", "まどぎわのせきでほんをひらくと、"),
        segment(
          "雨の音が優しい音楽のように聞こえました。",
          "あめのおとがやさしいおんがくのようにきこえました。",
        ),
      ),
      sentence(
        "遇到不认识的词时，我会先读前后文，再查意思。",
        segment("知らない言葉に出会ったら、", "しらないことばにであったら、"),
        segment(
          "前後の文を読んでから意味を調べます。",
          "ぜんごのぶんをよんでからいみをしらべます。",
        ),
      ),
      sentence(
        "回过神来时雨已经停了，我发现读书的时间过得真快。",
        segment("気がつくと雨はやんでいて、", "きがつくとあめはやんでいて、"),
        segment(
          "読書の時間が短く感じられました。",
          "どくしょのじかんがみじかくかんじられました。",
        ),
      ),
    ],
  },
];
