import { settings } from "./settings";
import { sidebar } from "./sidebar";
import { task } from "./task";
import { newTask } from "./newTask";
import { projects } from "./projects";
import { projectDetail } from "./projectDetail";
import { scheduled } from "./scheduled";
import { customize } from "./customize";
import { composer } from "./composer";

export const en = {
  ...settings,
  ...sidebar,
  ...task,
  ...newTask,
  ...projects,
  ...projectDetail,
  ...scheduled,
  ...customize,
  ...composer,
};
