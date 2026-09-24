import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const { PromptEditor } = await import("@/app/(portal)/admin/contractors/[id]/PromptEditor");

const fetchMock = vi.fn();

beforeEach(() => {
  push.mockClear();
  refresh.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

const initial = {
  businessName: "Alpha HVAC",
  greeting: "Alpha HVAC, how can I help?",
  afterHoursOnly: true,
  objections: { "speak to the owner": "He's on a call." },
};

const renderEditor = () =>
  render(
    <PromptEditor contractorId="c-1" initial={initial} />,
  );

describe("PromptEditor", () => {
  it("loads the current prompt into editable fields", () => {
    renderEditor();
    expect(screen.getByLabelText("Greeting")).toHaveValue(initial.greeting);
    expect(screen.getByLabelText("Trigger phrase 1")).toHaveValue(
      "speak to the owner",
    );
    expect(screen.getByLabelText("Agent reply 1")).toHaveValue(
      "He's on a call.",
    );
  });

  it("reflects the after-hours toggle", () => {
    renderEditor();
    expect(screen.getByLabelText(/After-hours and overflow only/)).toBeChecked();
  });

  it("saves the edited prompt to the admin API", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, pushed: true }),
    });
    renderEditor();

    const greeting = screen.getByLabelText("Greeting");
    await userEvent.clear(greeting);
    await userEvent.type(greeting, "Alpha HVAC, after-hours line.");

    await userEvent.click(
      screen.getByRole("button", { name: /Save and push to agent/ }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/contractors/c-1/prompt");
    expect(init.method).toBe("PATCH");

    const body = JSON.parse(init.body);
    expect(body.greeting).toBe("Alpha HVAC, after-hours line.");
    expect(body.afterHoursOnly).toBe(true);
    expect(body.objections).toEqual({ "speak to the owner": "He's on a call." });
  });

  it("reports that the change was pushed to the agent", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ pushed: true }) });
    renderEditor();
    await userEvent.click(screen.getByRole("button", { name: /Save and push/ }));
    expect(await screen.findByText("Saved and pushed.")).toBeInTheDocument();
  });

  it("surfaces a failed save and does not claim success", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "update_failed" }),
    });
    renderEditor();

    await userEvent.click(screen.getByRole("button", { name: /Save and push/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("update_failed");
    expect(screen.queryByText("Saved and pushed.")).not.toBeInTheDocument();
  });

  it("adds a blank objection pair without discarding existing ones", async () => {
    renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Add phrase" }));
    expect(screen.getByLabelText("Trigger phrase 2")).toHaveValue("");
    expect(screen.getByLabelText("Trigger phrase 1")).toHaveValue(
      "speak to the owner",
    );
  });

  it("drops half-filled pairs on save rather than saving a blank script", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ pushed: true }) });
    renderEditor();

    await userEvent.click(screen.getByRole("button", { name: "Add phrase" }));
    await userEvent.type(screen.getByLabelText("Trigger phrase 2"), "how much");

    await userEvent.click(screen.getByRole("button", { name: /Save and push/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    // A key with no reply is not a usable script.
    expect(Object.keys(body.objections)).toEqual(["speak to the owner"]);
  });

  it("toggles after-hours off and persists it", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ pushed: true }) });
    renderEditor();

    await userEvent.click(screen.getByLabelText(/After-hours and overflow only/));
    await userEvent.click(screen.getByRole("button", { name: /Save and push/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).afterHoursOnly).toBe(false);
  });
});
