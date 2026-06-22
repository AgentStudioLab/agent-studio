// @streamdown/{code,math,mermaid} 分别拖入 shiki(~16MB 嵌套)、katex、mermaid+cytoscape
// (~5.5MB)，远超 5MB 上限。streamdown 的 PluginConfig.{code,math,mermaid} 均为可选，
// 置空即让 markdown 以纯文本/纯 <pre> 渲染：代码块无语法着色、不渲染图表/公式。
// 实际 story 极少含这些块，对预览基本无视觉影响。详见 .design-sync/NOTES.md。
export const code = undefined; // @streamdown/code
export const math = undefined; // @streamdown/math
export const createMermaidPlugin = () => undefined; // @streamdown/mermaid
