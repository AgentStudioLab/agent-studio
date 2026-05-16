import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  CodeBlock,
  CodeBlockCopyButton,
} from "@/components/ai-elements/code-block";

const meta: Meta<typeof CodeBlock> = {
  title: "AI Elements/CodeBlock",
  component: CodeBlock,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof CodeBlock>;

const tsSnippet = `import { useState } from "react";
import { CodeBlock } from "@/components/ai-elements/code-block";

export function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button onClick={() => setCount((c) => c + 1)}>
      count is {count}
    </button>
  );
}`;

const bashSnippet = `$ ls -la
total 32
drwxr-xr-x  8 user staff  256 May 17 14:00 .
drwxr-xr-x  5 user staff  160 May 17 13:58 ..
-rw-r--r--  1 user staff   42 May 17 14:00 README.md
-rw-r--r--  1 user staff 1024 May 17 14:00 package.json`;

const markdownSnippet = `# Agent Studio

A desktop AI workspace powered by **Claude**.

## Features

- Sidecar-based architecture
- Tauri v2 shell
- React 19 + Tailwind v4

\`\`\`bash
bun run tauri:dev
\`\`\`

See [docs](./docs) for details.`;

export const TypeScript: Story = {
  render: () => (
    <div style={{ maxWidth: 720 }}>
      <CodeBlock code={tsSnippet} language="typescript" />
    </div>
  ),
};

export const Bash: Story = {
  render: () => (
    <div style={{ maxWidth: 720 }}>
      <CodeBlock code={bashSnippet} language="bash" />
    </div>
  ),
};

export const Markdown: Story = {
  render: () => (
    <div style={{ maxWidth: 720 }}>
      <CodeBlock code={markdownSnippet} language="markdown" />
    </div>
  ),
};

export const WithCopyButton: Story = {
  render: () => (
    <div style={{ maxWidth: 720 }}>
      <CodeBlock code={tsSnippet} language="typescript">
        <div className="absolute top-2 right-2 z-10">
          <CodeBlockCopyButton />
        </div>
      </CodeBlock>
    </div>
  ),
};

export const SideBySide: Story = {
  render: () => (
    <div
      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}
    >
      <div style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}>
        <CodeBlock code={tsSnippet} language="typescript">
          <div className="absolute top-2 right-2 z-10">
            <CodeBlockCopyButton />
          </div>
        </CodeBlock>
      </div>
      <div
        data-mode="dark"
        style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}
      >
        <CodeBlock code={tsSnippet} language="typescript">
          <div className="absolute top-2 right-2 z-10">
            <CodeBlockCopyButton />
          </div>
        </CodeBlock>
      </div>
    </div>
  ),
};
