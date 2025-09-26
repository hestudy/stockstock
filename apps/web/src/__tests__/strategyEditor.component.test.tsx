/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

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

describe("<StrategyEditor />", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("exposes editor error highlight placeholder as a live region (AC2)", async () => {
    render(<StrategyEditor />);

    const placeholder = await screen.findByTestId("editor-error-placeholder");
    expect(placeholder).toBeTruthy();
    expect(placeholder.getAttribute("aria-live")).toBe("polite");
  });

  it("renders and loads template into editor (AC: 1,2)", async () => {
    render(<StrategyEditor />);

    // our mock exposes the textarea via data-testid="cm"
    const textarea = (await screen.findByTestId("cm")) as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.value.length).toBeGreaterThan(0);
  });

  it("reset button restores template content (data-testid=reset-template)", async () => {
    render(<StrategyEditor />);

    const textarea = (await screen.findByTestId("cm")) as HTMLTextAreaElement;
    const original = textarea.value;

    fireEvent.change(textarea, { target: { value: "print('changed')" } });
    expect(textarea.value).toContain("changed");

    const resetBtn = await screen.findByTestId("reset-template");
    fireEvent.click(resetBtn);

    await waitFor(() => {
      expect((screen.getByTestId("cm") as HTMLTextAreaElement).value).toBe(original);
    });
  });

  it("allows editing metadata fields and persists sanitised tags", async () => {
    const STORAGE_KEY = "strategy-editor:draft";
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    render(<StrategyEditor />);

    const codeMirror = (await screen.findByTestId("cm")) as HTMLTextAreaElement;
    const nameInput = (await screen.findByLabelText("策略名称")) as HTMLInputElement;
    const tagsInput = (await screen.findByLabelText("策略标签")) as HTMLInputElement;
    const descInput = (await screen.findByLabelText("策略描述")) as HTMLTextAreaElement;
    const tsInput = (await screen.findByLabelText("版本时间戳")) as HTMLInputElement;

    fireEvent.change(codeMirror, { target: { value: "print('new content')" } });
    fireEvent.change(nameInput, { target: { value: "趋势策略" } });
    fireEvent.change(tagsInput, { target: { value: " foo ,bar ,, baz" } });
    fireEvent.change(descInput, { target: { value: "测试描述" } });
    fireEvent.change(tsInput, { target: { value: "2024-01-01T08:00:00.000Z" } });

    expect((screen.getByTestId("cm") as HTMLTextAreaElement).value).toContain("new content");
    expect((screen.getByLabelText("策略名称") as HTMLInputElement).value).toBe("趋势策略");
    expect((screen.getByLabelText("策略标签") as HTMLInputElement).value).toContain("foo");
    expect((screen.getByLabelText("策略描述") as HTMLTextAreaElement).value).toBe("测试描述");
    expect((screen.getByLabelText("版本时间戳") as HTMLInputElement).value).toBe(
      "2024-01-01T08:00:00.000Z",
    );

    await waitFor(() => {
      const stored = localStorage.getItem(STORAGE_KEY);
      expect(stored).toBeTruthy();
      if (!stored) throw new Error("no draft stored");
      expect(JSON.parse(stored).metadata?.tags).toEqual(["foo", "bar", "baz"]);
    });

    setItemSpy.mockRestore();
  });

  it("requirements invalid input shows validation message", async () => {
    render(<StrategyEditor />);

    const reqBox = (await screen.findByTestId("requirements-input")) as HTMLTextAreaElement;

    fireEvent.change(reqBox, { target: { value: "in valid@ver sion" } });

    await waitFor(() => {
      const err = screen.getByTestId("requirements-error");
      expect(err.textContent || "").toMatch(/非法|解析失败/);
    });
  });

  it("clear button wipes editor state and removes stored draft", async () => {
    const removeSpy = vi.spyOn(Storage.prototype, "removeItem");
    render(<StrategyEditor />);

    const clearButton = await screen.findByRole("button", { name: "清空" });
    fireEvent.click(clearButton);

    await waitFor(() => {
      expect((screen.getByTestId("cm") as HTMLTextAreaElement).value).toBe("");
      expect((screen.getByLabelText("策略名称") as HTMLInputElement).value).toBe("");
      expect((screen.getByLabelText("策略标签") as HTMLInputElement).value).toBe("");
      expect((screen.getByLabelText("策略描述") as HTMLTextAreaElement).value).toBe("");
      expect((screen.getByLabelText("依赖清单") as HTMLTextAreaElement).value).toBe("");
    });

    const tsInput = screen.getByLabelText("版本时间戳") as HTMLInputElement;
    expect(tsInput.value).toMatch(/T/);
    expect(screen.getByText("已清空草稿")).toBeTruthy();
    expect(removeSpy).toHaveBeenCalledWith("strategy-editor:draft");

    removeSpy.mockRestore();
  });

  it("handles field updates through testing-library change events", async () => {
    render(<StrategyEditor />);

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
  });
});
