/* ===================================================
   格言データ（起動時に日替わりで1件表示）
   後から追加する場合はこの配列に {en, ja, author, authorJa} を追加するだけでOK
   =================================================== */
var QUOTES = [
  {
    en: "Keep your face to the sunshine and you cannot see a shadow.",
    ja: "顔を太陽に向けていれば、影は見えない。",
    author: "Helen Keller",
    authorJa: "ヘレン・ケラー"
  },
  {
    en: "It always seems impossible until it's done.",
    ja: "何事も成し遂げるまでは不可能に思えるものだ。",
    author: "Nelson Mandela",
    authorJa: "ネルソン・マンデラ"
  },
  {
    en: "Genius is one percent inspiration and ninety-nine percent perspiration.",
    ja: "天才とは1%のひらめきと99%の努力である。",
    author: "Thomas Edison",
    authorJa: "トーマス・エジソン"
  },
  {
    en: "It's not that I'm so smart, it's just that I stay with problems longer.",
    ja: "私が特別賢いわけではない。ただ、人より長く問題と向き合っているだけだ。",
    author: "Albert Einstein",
    authorJa: "アルベルト・アインシュタイン"
  },
  {
    en: "It does not matter how slowly you go as long as you do not stop.",
    ja: "どれだけゆっくり進んでも構わない、立ち止まらない限り。",
    author: "Confucius",
    authorJa: "孔子"
  },
  {
    en: "Success is not final, failure is not fatal: it is the courage to continue that counts.",
    ja: "成功は最終ではなく、失敗も致命的ではない。大切なのは続ける勇気だ。",
    author: "Winston Churchill",
    authorJa: "ウィンストン・チャーチル"
  },
  {
    en: "The way to get started is to quit talking and begin doing.",
    ja: "始める一番の方法は、話すのをやめて行動することだ。",
    author: "Walt Disney",
    authorJa: "ウォルト・ディズニー"
  },
  {
    en: "You may encounter many defeats, but you must not be defeated.",
    ja: "何度も敗北を経験するかもしれないが、負けを認めてはならない。",
    author: "Maya Angelou",
    authorJa: "マヤ・アンジェロウ"
  },
  {
    en: "Your time is limited, so don't waste it living someone else's life.",
    ja: "時間は限られている。他人の人生を生きて無駄にするな。",
    author: "Steve Jobs",
    authorJa: "スティーブ・ジョブズ"
  },
  {
    en: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.",
    ja: "我々は繰り返す行動そのものである。優れていることは行為ではなく習慣なのだ。",
    author: "Aristotle",
    authorJa: "アリストテレス"
  },
  {
    en: "An investment in knowledge pays the best interest.",
    ja: "知識への投資は最高の利息を生む。",
    author: "Benjamin Franklin",
    authorJa: "ベンジャミン・フランクリン"
  },
  {
    en: "Whether you think you can, or you think you can't – you're right.",
    ja: "できると思えばできる、できないと思えばできない。",
    author: "Henry Ford",
    authorJa: "ヘンリー・フォード"
  },
  {
    en: "The future belongs to those who believe in the beauty of their dreams.",
    ja: "未来は自分の夢の美しさを信じる者のものだ。",
    author: "Eleanor Roosevelt",
    authorJa: "エレノア・ルーズベルト"
  },
  {
    en: "Live as if you were to die tomorrow. Learn as if you were to live forever.",
    ja: "明日死ぬかのように生き、永遠に生きるかのように学べ。",
    author: "Mahatma Gandhi",
    authorJa: "マハトマ・ガンジー"
  },
  {
    en: "Great things are done by a series of small things brought together.",
    ja: "偉大なことは、小さなことの積み重ねによって成し遂げられる。",
    author: "Vincent van Gogh",
    authorJa: "フィンセント・ファン・ゴッホ"
  },
  {
    en: "Nothing ever comes to one, that is worth having, except as a result of hard work.",
    ja: "価値あるものは、努力の結果としてしか得られない。",
    author: "Booker T. Washington",
    authorJa: "ブッカー・T・ワシントン"
  },
  {
    en: "Nothing in life is to be feared, it is only to be understood.",
    ja: "人生において恐れるべきものは何もない、理解すべきものがあるだけだ。",
    author: "Marie Curie",
    authorJa: "マリー・キュリー"
  },
  {
    en: "A dream doesn't become reality through magic; it takes sweat, determination and hard work.",
    ja: "夢は魔法では実現しない。汗と決意と努力が必要だ。",
    author: "Colin Powell",
    authorJa: "コリン・パウエル"
  },
  {
    en: "Learning without thought is labor lost; thought without learning is perilous.",
    ja: "学びて思わざれば則ち罔し、思いて学ばざれば則ち殆し。",
    author: "Confucius",
    authorJa: "孔子"
  },
  {
    en: "The man who has no imagination has no wings.",
    ja: "想像力のない者には翼がない。",
    author: "Muhammad Ali",
    authorJa: "モハメド・アリ"
  }
];
