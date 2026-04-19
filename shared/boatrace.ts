// 競艇場一覧
export const STADIUMS = [
  { id: "01", name: "桐生", prefecture: "群馬" },
  { id: "02", name: "戸田", prefecture: "埼玉" },
  { id: "03", name: "江戸川", prefecture: "東京" },
  { id: "04", name: "平和島", prefecture: "東京" },
  { id: "05", name: "多摩川", prefecture: "東京" },
  { id: "06", name: "浜名湖", prefecture: "静岡" },
  { id: "07", name: "蒲郡", prefecture: "愛知" },
  { id: "08", name: "常滑", prefecture: "愛知" },
  { id: "09", name: "津", prefecture: "三重" },
  { id: "10", name: "三国", prefecture: "福井" },
  { id: "11", name: "びわこ", prefecture: "滋賀" },
  { id: "12", name: "住之江", prefecture: "大阪" },
  { id: "13", name: "尼崎", prefecture: "兵庫" },
  { id: "14", name: "鳴門", prefecture: "徳島" },
  { id: "15", name: "丸亀", prefecture: "香川" },
  { id: "16", name: "児島", prefecture: "岡山" },
  { id: "17", name: "宮島", prefecture: "広島" },
  { id: "18", name: "徳山", prefecture: "山口" },
  { id: "19", name: "下関", prefecture: "山口" },
  { id: "20", name: "若松", prefecture: "福岡" },
  { id: "21", name: "芦屋", prefecture: "福岡" },
  { id: "22", name: "福岡", prefecture: "福岡" },
  { id: "23", name: "唐津", prefecture: "佐賀" },
  { id: "24", name: "大村", prefecture: "長崎" },
] as const;

export type StadiumId = (typeof STADIUMS)[number]["id"];

export const STADIUM_MAP = Object.fromEntries(
  STADIUMS.map((s) => [s.id, s])
) as Record<string, { id: string; name: string; prefecture: string }>;

// レーサー級別
export const RACER_CLASSES = ["A1", "A2", "B1", "B2"] as const;
export type RacerClass = (typeof RACER_CLASSES)[number];

export const CLASS_COLORS: Record<string, string> = {
  A1: "#e53e3e",
  A2: "#dd6b20",
  B1: "#3182ce",
  B2: "#718096",
};

// 艇番カラー
export const BOAT_COLORS: Record<number, { bg: string; text: string; name: string }> = {
  1: { bg: "#ffffff", text: "#000000", name: "白" },
  2: { bg: "#000000", text: "#ffffff", name: "黒" },
  3: { bg: "#ff0000", text: "#ffffff", name: "赤" },
  4: { bg: "#0000ff", text: "#ffffff", name: "青" },
  5: { bg: "#ffff00", text: "#000000", name: "黄" },
  6: { bg: "#00aa00", text: "#ffffff", name: "緑" },
};

// レース番号
export const RACE_NUMBERS = Array.from({ length: 12 }, (_, i) => i + 1);
