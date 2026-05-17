import type { MockProject } from "@/lib/mock/types";

interface ProjectCardProps {
  project: MockProject;
  onClick?: () => void;
}

export function ProjectCard({ project, onClick }: ProjectCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-6 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <h3 className="font-serif text-[22px] font-medium leading-tight text-foreground">{project.name}</h3>
      <span className="text-xs text-muted-foreground">{project.lastActivity}</span>
    </button>
  );
}
