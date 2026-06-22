// @js-preview/{docx,excel,pdf} 依赖 node built-ins（stream/events/buffer/util），
// 浏览器 IIFE 无法打包。用空 stub 顶替——office 文档预览依赖 Tauri 文件流，在
// claude.ai/design 的独立预览里本就无意义，且默认 story 不会触发它（懒加载）。
// 详见 .design-sync/NOTES.md。
const noop = () => ({ destroy() {}, on() {}, off() {} });
export default { init: noop };
export const init = noop;
