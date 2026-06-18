// 让 tsc 认识 `import md from "./X.md" with { type: "text" }` 的文本 import。
// bun（run / build --compile）原生把 .md 作为文本嵌入；这里只补类型声明。
declare module "*.md" {
  const content: string;
  export default content;
}
