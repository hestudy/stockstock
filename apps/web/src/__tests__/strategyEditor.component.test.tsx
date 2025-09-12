/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import React from "react";
import { act } from "react-dom/test-utils";
import * as ReactDOMClient from "react-dom/client";

// Mock CodeMirror to a simple textarea so we can interact in jsdom
vi.mock("@uiw/react-codemirror", () => {
  return {
    __esModule: true,
    default: (props: any) =>
      React.createElement("textarea", {
        "data-testid": "cm",
        value: props.value,
        onChange: (e: any) => props.onChange?.(e.target.value),
        style: { width: 400, height: 200 },
      }),
  };
});

// Import after mocks
import StrategyEditor from "../components/forms/StrategyEditor";

// Helpers
function findByTestId(root: HTMLElement, id: string): HTMLElement | null {
  return root.querySelector(`[data-testid="${id}"]`);
}

async function waitFor(fn: () => void, timeout = 1500, step = 25) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      fn();
      return; // success
    } catch (e) {
      if (Date.now() - start > timeout) throw e;
      await new Promise((r) => setTimeout(r, step));
    }
  }
}

describe("<StrategyEditor />", () => {
  let container: HTMLDivElement;
  let root: ReactDOMClient.Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.innerHTML = "";
    document.body.appendChild(container);
    root = ReactDOMClient.createRoot(container);
    // fresh localStorage per test
    localStorage.clear();
  });

  it("exposes editor error highlight placeholder as a live region (AC2)", async () => {
    await act(async () => {
      root.render(React.createElement(StrategyEditor));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });

    const placeholder = findByTestId(container, "editor-error-placeholder");
    expect(placeholder).toBeTruthy();
    expect(placeholder?.getAttribute("aria-live")).toBe("polite");
  });

  it("renders and loads template into editor (AC: 1,2)", async () => {
    await act(async () => {
      root.render(React.createElement(StrategyEditor));
    });

    // allow effects to run
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const editor = findByTestId(container, "editor");
    // our mock places the textarea as the first child inside editor div
    const textarea = editor?.querySelector("textarea");
    expect(textarea).toBeTruthy();
    expect((textarea as HTMLTextAreaElement).value.length).toBeGreaterThan(0);
  });

  it("reset button restores template content (data-testid=reset-template)", async () => {
    await act(async () => {
      root.render(React.createElement(StrategyEditor));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const editor = findByTestId(container, "editor");
    let textarea = editor?.querySelector("textarea") as HTMLTextAreaElement;
    const original = textarea.value;

    // modify content
    await act(async () => {
      textarea.value = "print('changed')";
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(textarea.value).toContain("changed");

    // click reset to template
    const resetBtn = findByTestId(container, "reset-template") as HTMLButtonElement;
    await act(async () => {
      resetBtn.click();
      await new Promise((r) => setTimeout(r, 50));
    });

    // requery after state update
    textarea = (findByTestId(container, "editor") as HTMLElement).querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea.value).toBe(original);
  });

  it("requirements invalid input shows validation message", async () => {
    await act(async () => {
      root.render(React.createElement(StrategyEditor));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });

    const reqBox = document.querySelector('[data-testid="requirements-input"]') as HTMLTextAreaElement;
    expect(reqBox).toBeTruthy();

    await act(async () => {
      reqBox.value = "in valid@ver sion"; // 含空格将触发非法
      reqBox.dispatchEvent(new Event("input", { bubbles: true }));
      reqBox.dispatchEvent(new Event("change", { bubbles: true }));
      reqBox.dispatchEvent(new Event("blur", { bubbles: true }));
    });

    // 校验消息应出现（等待渲染完成，最多200ms）
    await act(async () => {
      // 先等待一次短暂延迟，再进入轮询
      await new Promise((r) => setTimeout(r, 50));
      await waitFor(() => {
        const err = container.querySelector('[data-testid="requirements-error"]');
        expect(err?.textContent || "").toMatch(/非法|解析失败/);
      });
    });
  });
});
