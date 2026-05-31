import { describe, expect, it } from "bun:test";
import { prioritizeSelectedModel } from "./modelSectionModels";

describe("prioritizeSelectedModel", () => {
  it("moves the selected model to the front so it becomes the default model", () => {
    const models = [
      {
        id: "first",
        displayName: "First",
        description: "First model",
      },
      {
        id: "selected",
        displayName: "Selected",
        description: "Selected model",
      },
      {
        id: "third",
        displayName: "Third",
        description: "Third model",
      },
    ];

    expect(prioritizeSelectedModel(models, "selected")).toEqual([
      {
        id: "selected",
        displayName: "Selected",
        description: "Selected model",
      },
      {
        id: "first",
        displayName: "First",
        description: "First model",
      },
      {
        id: "third",
        displayName: "Third",
        description: "Third model",
      },
    ]);
  });
});
