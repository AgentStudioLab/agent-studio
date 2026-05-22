import { GlobalWindow } from "happy-dom";

const happyWindow = new GlobalWindow();
(globalThis as { window?: unknown }).window = happyWindow;
(globalThis as { document?: unknown }).document = happyWindow.document;
(globalThis as { navigator?: unknown }).navigator = happyWindow.navigator;

// Signal to React that we're in a test environment so act() works correctly.
// Set on both globalThis and on the window reference React may use.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(happyWindow as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
