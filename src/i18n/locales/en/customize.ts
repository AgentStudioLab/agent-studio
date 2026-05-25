import type { customize as Zh } from "../zh/customize";

export const customize: typeof Zh = {
  customize: {
    title: "Customize",
    back: "Back",
    nav: {
      skills: "Skills",
      agents: "Agents",
      personalPlugins: "Personal plugins",
      personalPluginsHint:
        "Give Agent Studio role-level expertise with plugins.",
      addPersonalPlugin: "Add personal plugin",
      browsePlugins: "Browse plugins",
    },
    home: {
      title: "Customize Agent Studio",
      subtitle:
        "Skills, connectors, and plugins shape how Agent Studio works with you.",
      connect: {
        title: "Connect your apps",
        description:
          "Let Agent Studio read and write to the tools you already use.",
      },
      skills: {
        title: "Create new skills",
        description:
          "Teach Agent Studio your processes, team norms, and expertise.",
      },
      plugins: {
        title: "Browse plugins",
        description: "Add pre-built knowledge for your field.",
      },
    },
    skills: {
      personal: "Personal skills",
      builtIn: "Built-in skills",
      empty: "Select a skill from the left.",
      loading: "Loading…",
      enabled: "Enabled",
      more: "More",
      addedBy: "Added by",
      addedByYou: "You",
      addedByBuiltin: "Agent Studio",
      location: "Location",
      trigger: "Trigger",
      triggerValue: "Manual + auto-suggest",
      howItWorks: "How it works",
      bullets: {
        autoTrigger: "Triggers automatically when relevant context is detected.",
        tagged: "Outputs are tagged with the skill name.",
      },
    },
    agents: {
      my: "My agents",
      builtIn: "Built-in agents",
      empty: "Select an agent",
      enabled: "Enabled",
      more: "More",
      addedBy: "Added by",
      addedByYou: "You",
      addedByAnthropic: "Anthropic",
      trigger: "Trigger",
      triggerValue: "Manual + auto-suggest",
      systemPrompt: "System prompt",
      edit: "Edit",
      allowedSkills: "Allowed skills",
      addSkill: "Add skill",
      mcpServers: "MCP servers",
      addServer: "Add server",
      allowedProjects: "Allowed projects",
      addProject: "Add project",
      allProjects: "All projects (no restriction)",
    },
    plugins: {
      title: "Browse plugins",
      subtitle:
        "Pre-built knowledge bundles authored by Anthropic and community partners. Install one to give Agent Studio role-level expertise instantly.",
      install: "Install",
      installed: "Installed",
      installsSuffix: "installs",
      empty: "No plugins in this category yet.",
      authorPrefix: "by ",
      categories: {
        all: "All",
        productivity: "Productivity",
        research: "Research",
        development: "Development",
        communication: "Communication",
        design: "Design",
        data: "Data",
      },
    },
  },
};
