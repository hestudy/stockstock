/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import React from "react";
import { act } from "react-dom/test-utils";
import * as ReactDOMClient from "react-dom/client";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

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
    textarea = (findByTestId(container, "editor") as HTMLElement).querySelector(
      "textarea",
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe(original);
  });

  it("allows editing metadata fields and persists sanitised tags", async () => {
    const STORAGE_KEY = "strategy-editor:draft";
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const initialCallCount = setItemSpy.mock.calls.length;

    await act(async () => {
      root.render(React.createElement(StrategyEditor));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const editor = findByTestId(container, "editor");
    const codeMirror = editor?.querySelector("textarea") as HTMLTextAreaElement;
    const nameInput = container.querySelector("#meta-name") as HTMLInputElement;
    const tagsInput = container.querySelector("#meta-tags") as HTMLInputElement;
    const descInput = container.querySelector("#meta-desc") as HTMLTextAreaElement;
    const tsInput = container.querySelector("#meta-ts") as HTMLInputElement;

    await act(async () => {
      codeMirror.value = "print('new content')";
      codeMirror.dispatchEvent(new Event("input", { bubbles: true }));
      codeMirror.dispatchEvent(new Event("change", { bubbles: true }));
      nameInput.value = "趋势策略";
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
      nameInput.dispatchEvent(new Event("change", { bubbles: true }));
      tagsInput.value = " foo ,bar ,, baz";
      tagsInput.dispatchEvent(new Event("input", { bubbles: true }));
      tagsInput.dispatchEvent(new Event("change", { bubbles: true }));
      descInput.value = "测试描述";
      descInput.dispatchEvent(new Event("input", { bubbles: true }));
      descInput.dispatchEvent(new Event("change", { bubbles: true }));
      tsInput.value = "2024-01-01T08:00:00.000Z";
      tsInput.dispatchEvent(new Event("input", { bubbles: true }));
      tsInput.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 30));
    });

    const updatedTagsInput = container.querySelector("#meta-tags") as HTMLInputElement;
    const updatedNameInput = container.querySelector("#meta-name") as HTMLInputElement;
    const updatedDescInput = container.querySelector("#meta-desc") as HTMLTextAreaElement;
    const updatedTsInput = container.querySelector("#meta-ts") as HTMLInputElement;
    const updatedCodeMirror = (findByTestId(container, "editor") as HTMLElement)?.querySelector(
      "textarea",
    ) as HTMLTextAreaElement;

    expect(updatedCodeMirror.value).toContain("new content");
    expect(updatedNameInput.value).toBe("趋势策略");
    expect(updatedTagsInput.value).toContain("foo");
    expect(updatedDescInput.value).toBe("测试描述");
    expect(updatedTsInput.value).toBe("2024-01-01T08:00:00.000Z");

    await waitFor(() => {
      expect(setItemSpy.mock.calls.length).toBeGreaterThan(initialCallCount);
      const latestPayload = setItemSpy.mock.calls.at(-1)?.[1];
      expect(latestPayload).toBeTruthy();
    });

    setItemSpy.mockRestore();
  });

  it("requirements invalid input shows validation message", async () => {
    await act(async () => {
      root.render(React.createElement(StrategyEditor));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });

    const reqBox = document.querySelector(
      '[data-testid="requirements-input"]',
    ) as HTMLTextAreaElement;
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

  it("clear button wipes editor state and removes stored draft", async () => {
    const removeSpy = vi.spyOn(Storage.prototype, "removeItem");

    await act(async () => {
      root.render(React.createElement(StrategyEditor));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const clearButton = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("清空"),
    ) as HTMLButtonElement;

    await act(async () => {
      clearButton.click();
      await new Promise((r) => setTimeout(r, 25));
    });

    const editor = findByTestId(container, "editor");
    const editorTextarea = editor?.querySelector("textarea") as HTMLTextAreaElement;
    const nameInput = container.querySelector("#meta-name") as HTMLInputElement;
    const tagsInput = container.querySelector("#meta-tags") as HTMLInputElement;
    const descInput = container.querySelector("#meta-desc") as HTMLTextAreaElement;
    const tsInput = container.querySelector("#meta-ts") as HTMLInputElement;
    const reqBox = container.querySelector(
      '[data-testid="requirements-input"]',
    ) as HTMLTextAreaElement;
    const message = Array.from(container.querySelectorAll("span")).find((span) =>
      span.textContent?.includes("清空草稿"),
    );

    expect(editorTextarea.value).toBe("");
    expect(nameInput.value).toBe("");
    expect(tagsInput.value).toBe("");
    expect(descInput.value).toBe("");
    expect(tsInput.value).toMatch(/T/); // 重置为当前时间戳
    expect(reqBox.value).toBe("");
    expect(message?.textContent).toBe("已清空草稿");
    expect(removeSpy).toHaveBeenCalledWith("strategy-editor:draft");

    removeSpy.mockRestore();
  });

  it("handles field updates through testing-library change events", async () => {
    render(React.createElement(StrategyEditor));

    const codeMirror = await screen.findByTestId("cm");
    fireEvent.change(codeMirror, { target: { value: "print('alpha')" } });
    expect((codeMirror as HTMLTextAreaElement).value).toContain("alpha");

    const nameInput = await screen.findByLabelText("策略名称");
    fireEvent.change(nameInput, { target: { value: "策略Alpha" } });
    expect((nameInput as HTMLInputElement).value).toBe("策略Alpha");

    const tagsInput = await screen.findByLabelText("策略标签");
    fireEvent.change(tagsInput, { target: { value: "tag-one, tag-two" } });
    expect((tagsInput as HTMLInputElement).value).toContain("tag-one");

    const descInput = await screen.findByLabelText("策略描述");
    fireEvent.change(descInput, { target: { value: "描述信息" } });
    expect((descInput as HTMLTextAreaElement).value).toBe("描述信息");

    const tsInput = await screen.findByLabelText("版本时间戳");
    fireEvent.change(tsInput, { target: { value: "2024-05-01T00:00:00.000Z" } });
    expect((tsInput as HTMLInputElement).value).toBe("2024-05-01T00:00:00.000Z");

    const reqInput = await screen.findByLabelText("依赖清单");
    fireEvent.change(reqInput, { target: { value: "numpy\npandas" } });
    expect((reqInput as HTMLTextAreaElement).value).toContain("numpy");

    cleanup();
  });
});
