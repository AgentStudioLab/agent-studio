import type { MockSkill } from "./types";

export const loadedSkills: MockSkill[] = [
  {
    id: "filesystem",
    name: "Filesystem",
    initials: "FS",
    description: "本地文件读写",
    hue: "orange",
  },
  {
    id: "disk-analyzer",
    name: "Disk analyzer",
    initials: "DA",
    description: "磁盘占用扫描",
    hue: "blue",
  },
  {
    id: "xlsx",
    name: "XLSX writer",
    initials: "XL",
    description: "Excel 表格生成",
    hue: "green",
  },
  {
    id: "cleanup-advisor",
    name: "Cleanup advisor",
    initials: "CA",
    description: "清理建议生成",
    hue: "purple",
  },
];
