/** Kana spelling, not pronunciation: particles は / へ / を stay ha / he / wo. */
const SPELLINGS: Record<string, string[]> = {};

function add(kana: string, romaji: string) {
  kana.split(" ").forEach((value, index) => {
    SPELLINGS[value] = romaji.split(" ")[index].split("/");
  });
}

add("あ い う え お", "a i/yi u/wu/whu e o");
add("か き く け こ", "ka ki ku/cu/qu ke ko/co");
add("さ し す せ そ", "sa shi/si su se/ce so");
add("た ち つ て と", "ta chi/ti tsu/tu te to");
add("な に ぬ ね の", "na ni nu ne no");
add("は ひ ふ へ ほ", "ha hi fu/hu he ho");
add("ま み む め も", "ma mi mu me mo");
add("や ゆ よ", "ya yu yo");
add("ら り る れ ろ", "ra ri ru re ro");
add("わ ゐ ゑ を", "wa wi we wo");
add("が ぎ ぐ げ ご", "ga gi gu ge go");
add("ざ じ ず ぜ ぞ", "za ji/zi zu ze zo");
add("だ ぢ づ で ど", "da di du de do");
add("ば び ぶ べ ぼ", "ba bi bu be bo");
add("ぱ ぴ ぷ ぺ ぽ", "pa pi pu pe po");
add("ぁ ぃ ぅ ぇ ぉ", "xa/la xi/li/xyi/lyi xu/lu xe/le/xye/lye xo/lo");
add(
  "ゃ ゅ ょ ゎ ゕ ゖ ゔ ー",
  "xya/lya xyu/lyu xyo/lyo xwa/lwa xka/lka xke/lke vu -",
);
add("っ", "xtu/ltu/xtsu/ltsu");

const CONTRACTED: Record<string, string[]> = {
  き: ["ky"],
  ぎ: ["gy"],
  し: ["sh", "sy"],
  じ: ["j", "jy", "zy"],
  ち: ["ch", "cy", "ty"],
  ぢ: ["dy"],
  に: ["ny"],
  ひ: ["hy"],
  び: ["by"],
  ぴ: ["py"],
  み: ["my"],
  り: ["ry"],
};
for (const [base, prefixes] of Object.entries(CONTRACTED)) {
  for (const [small, vowel] of [
    ["ゃ", "a"],
    ["ゅ", "u"],
    ["ょ", "o"],
    ["ぇ", "e"],
  ]) {
    SPELLINGS[base + small] = prefixes.map((prefix) => prefix + vowel);
  }
}
add("ふぁ ふぃ ふぇ ふぉ ふゅ", "fa fi fe fo fyu");
add("うぃ うぇ うぉ", "wi/whi we/whe who");
add("ゔぁ ゔぃ ゔぇ ゔぉ ゔゅ", "va vi ve vo vyu");
add("てぃ でぃ とぅ どぅ てゅ でゅ", "thi dhi twu dwu thu dhu");
add("つぁ つぃ つぇ つぉ", "tsa tsi tse tso");
add("くぁ くぃ くぇ くぉ ぐぁ", "kwa/qa qi qe qo gwa");

export function normalizeReading(value: string): string {
  return [...value.normalize("NFKC")]
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code >= 0x30a1 && code <= 0x30f6)
        return String.fromCharCode(code - 0x60);
      if (char === "-") return "ー";
      return char;
    })
    .filter((char) => char === "ー" || !/[\p{P}\p{Z}\s]/u.test(char))
    .join("");
}

/** Preferred input spelling for one kana or contracted kana in the selection chart. */
export function getKanaRomaji(kana: string): string | undefined {
  const reading = normalizeReading(kana);
  return reading === "ん" ? "n" : SPELLINGS[reading]?.[0];
}

type Edge = {
  key: string;
  to: number;
  readingStart: number;
  readingEnd: number;
};
type Predecessor = { from: number; edge: Edge };
type Suffix = { length: number; edge?: Edge };

export type RomajiDisplayGroup = {
  startSegment: number;
  endSegment: number;
  typed: string;
  remaining: string;
};
type Node = { edges: Edge[]; position: number };

/** A compact NFA: alternatives share kana boundaries, never expand whole sentences. */
export class RomajiMatcher {
  private nodes: Node[] = [];
  private states = new Set<number>([0]);
  private end: number;
  private reading: string;
  private entered = "";
  private predecessors: Map<number, Predecessor>[] = [];
  private suffixes = new Map<number, Suffix>();
  private displayPath?: { edges: Edge[]; remaining: string };
  private displayGroups?: { readings: string; groups: RomajiDisplayGroup[] };

  constructor(value: string) {
    this.reading = normalizeReading(value);
    if ([...this.reading].some((char) => char !== "ん" && !SPELLINGS[char])) {
      throw new Error("读音包含无法输入的字符，请使用假名。");
    }
    this.end = this.reading.length;
    this.suffixes.set(this.end, { length: 0 });
    this.nodes = Array.from({ length: this.end + 1 }, (_, position) => ({
      edges: [],
      position,
    }));
    const connect = (from: number, to: number, spelling: string) => {
      let node = from;
      [...spelling].forEach((key, index) => {
        const next = index === spelling.length - 1 ? to : this.nodes.length;
        if (next === this.nodes.length)
          this.nodes.push({ edges: [], position: from });
        this.nodes[node].edges.push({
          key,
          to: next,
          readingStart: from,
          readingEnd: to,
        });
        node = next;
      });
    };
    for (let i = 0; i < this.reading.length; i++) {
      const current = this.reading[i];
      if (current === "ん") {
        connect(i, i + 1, "nn");
        connect(i, i + 1, "n'");
        // Before a vowel or y, n must be explicitly committed. Before n, the
        // target text resolves nna as んな (and nna as んあ in that target).
        if (
          !/[あいうえおやゆよぁぃぅぇぉゃゅょ]/u.test(this.reading[i + 1] ?? "")
        ) {
          connect(i, i + 1, "n");
        }
        continue;
      }
      for (const spelling of SPELLINGS[current]) connect(i, i + 1, spelling);
      for (const spelling of SPELLINGS[this.reading.slice(i, i + 2)] ?? []) {
        if (i + 2 <= this.end) connect(i, i + 2, spelling);
      }
      if (
        current === "っ" &&
        i + 1 < this.end &&
        this.reading[i + 1] !== "っ"
      ) {
        const initials = new Set(
          [
            ...(SPELLINGS[this.reading[i + 1]] ?? []),
            ...(SPELLINGS[this.reading.slice(i + 1, i + 3)] ?? []),
          ]
            .map((spelling) => spelling[0])
            .filter((key) => /^[bcdfghjklmpqrstvwxyz]$/.test(key)),
        );
        for (const key of initials) connect(i, i + 1, key);
        // The common Hepburn spelling tchi also represents っち.
        if (this.reading[i + 1] === "ち") {
          connect(i, i + 2, "tchi");
          for (const [small, vowel] of [
            ["ゃ", "a"],
            ["ゅ", "u"],
            ["ょ", "o"],
          ]) {
            if (this.reading[i + 2] === small) connect(i, i + 3, "tch" + vowel);
          }
        }
      }
    }
  }

  input(key: string): boolean {
    if (key.length !== 1) return false;
    const normalized = key.toLowerCase();
    const next = new Set<number>();
    const predecessors = new Map<number, Predecessor>();
    for (const state of this.states) {
      for (const edge of this.nodes[state].edges) {
        if (edge.key !== normalized) continue;
        next.add(edge.to);
        if (!predecessors.has(edge.to))
          predecessors.set(edge.to, { from: state, edge });
      }
    }
    if (!next.size) return false;
    this.states = next;
    this.predecessors.push(predecessors);
    this.entered += normalized;
    this.displayPath = undefined;
    this.displayGroups = undefined;
    return true;
  }

  get done(): boolean {
    return this.states.has(this.end);
  }
  get typed(): string {
    return this.entered;
  }
  get progress(): number {
    return this.done
      ? 1
      : Math.max(
          ...[...this.states].map((state) => this.nodes[state].position),
        ) / (this.end || 1);
  }
  get nextKeys(): string[] {
    return [
      ...new Set(
        [...this.states].flatMap((state) =>
          this.nodes[state].edges.map((edge) => edge.key),
        ),
      ),
    ];
  }
  private shortestSuffix(node: number): Suffix {
    const cached = this.suffixes.get(node);
    if (cached) return cached;
    let best: Suffix | undefined;
    for (const edge of this.nodes[node].edges) {
      const length = 1 + this.shortestSuffix(edge.to).length;
      if (!best || length < best.length) best = { length, edge };
    }
    // Every spelling in the graph leads to the final reading boundary.
    this.suffixes.set(node, best!);
    return best!;
  }

  private getDisplayPath(): { edges: Edge[]; remaining: string } {
    if (this.displayPath) return this.displayPath;
    const selected = [...this.states].reduce((best, state) =>
      this.shortestSuffix(best).length <= this.shortestSuffix(state).length
        ? best
        : state,
    );
    const typedEdges: Edge[] = [];
    let node = selected;
    for (let i = this.predecessors.length - 1; i >= 0; i--) {
      const previous = this.predecessors[i].get(node)!;
      typedEdges.push(previous.edge);
      node = previous.from;
    }
    typedEdges.reverse();
    const remainingEdges: Edge[] = [];
    node = selected;
    while (node !== this.end) {
      const edge = this.shortestSuffix(node).edge!;
      remainingEdges.push(edge);
      node = edge.to;
    }
    this.displayPath = {
      edges: [...typedEdges, ...remainingEdges],
      remaining: remainingEdges.map((edge) => edge.key).join(""),
    };
    return this.displayPath;
  }

  get remaining(): string {
    return this.getDisplayPath().remaining;
  }

  /** Project the surviving spelling onto article segments, without adding keys. */
  getDisplayGroups(readings: readonly string[]): RomajiDisplayGroup[] {
    const cacheKey = JSON.stringify(readings);
    if (this.displayGroups?.readings === cacheKey)
      return this.displayGroups.groups;
    const normalized = readings.map(normalizeReading);
    if (normalized.join("") !== this.reading)
      throw new Error("分段读音必须与当前练习的完整读音一致。");

    const segmentForReading: number[] = [];
    normalized.forEach((reading, segment) => {
      for (let i = 0; i < reading.length; i++) segmentForReading.push(segment);
    });
    const path = this.getDisplayPath();
    const mergedBoundaries = new Set<number>();
    for (const edge of path.edges) {
      const first = segmentForReading[edge.readingStart];
      const last = segmentForReading[edge.readingEnd - 1];
      for (let segment = first + 1; segment <= last; segment++)
        mergedBoundaries.add(segment);
    }

    const groups: RomajiDisplayGroup[] = [];
    const groupForSegment: RomajiDisplayGroup[] = [];
    for (let segment = 0; segment < readings.length; segment++) {
      if (!mergedBoundaries.has(segment))
        groups.push({
          startSegment: segment,
          endSegment: segment + 1,
          typed: "",
          remaining: "",
        });
      const group = groups[groups.length - 1];
      group.endSegment = segment + 1;
      groupForSegment.push(group);
    }
    path.edges.forEach((edge, index) => {
      const group = groupForSegment[segmentForReading[edge.readingStart]];
      if (index < this.entered.length) group.typed += edge.key;
      else group.remaining += edge.key;
    });
    this.displayGroups = { readings: cacheKey, groups };
    return groups;
  }
}

export function canTypeReading(value: string): boolean {
  try {
    return (
      normalizeReading(value).length > 0 &&
      new RomajiMatcher(value).remaining.length > 0
    );
  } catch {
    return false;
  }
}
