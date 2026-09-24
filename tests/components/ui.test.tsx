import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { DataTable } from "@/components/ui/Table";
import { StatGrid } from "@/components/ui/StatGrid";

/*
 * First component tests in the project. Testing Library was installed from
 * the start and used nowhere until now.
 *
 * These cover the accessibility contracts the design mandate depends on —
 * labelling, keyboard operation, and the table structure a screen reader
 * navigates by. A visual regression would not catch any of these.
 */

describe("Button", () => {
  it("renders as a button by default", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("renders as a link when given an href", () => {
    render(<Button href="/pricing">See pricing</Button>);
    const link = screen.getByRole("link", { name: "See pricing" });
    expect(link).toHaveAttribute("href", "/pricing");
  });

  it("never nests an anchor inside a button", () => {
    // Invalid HTML that breaks keyboard and screen-reader semantics.
    render(<Button href="/x">Go</Button>);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("is reachable and activatable by keyboard", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Send</Button>);

    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Send" })).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("activates on Space", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Send</Button>);
    screen.getByRole("button").focus();
    await userEvent.keyboard(" ");
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not fire when disabled", async () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Send</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("defaults to type=button so it cannot submit a form by accident", () => {
    render(<Button>Cancel</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });
});

describe("Badge", () => {
  it("conveys urgency with text, not colour alone", () => {
    // WCAG 1.4.1: colour must not be the only means of conveying meaning.
    render(<Badge tone="critical">Critical</Badge>);
    const badge = screen.getByText("Critical");
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toBe("Critical");
  });
});

describe("Field", () => {
  it("associates the label with the input", () => {
    render(<Field label="Work email" />);
    expect(screen.getByLabelText("Work email")).toBeInTheDocument();
  });

  it("links a hint via aria-describedby", () => {
    render(<Field label="Calls" hint="All calls, not just missed ones." />);
    const input = screen.getByLabelText("Calls");
    const hint = screen.getByText("All calls, not just missed ones.");
    expect(input).toHaveAttribute("aria-describedby", hint.id);
  });

  it("announces an error and marks the field invalid", () => {
    render(<Field label="Email" error="Enter a valid address" />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid address");
  });

  it("generates unique ids for multiple fields", () => {
    render(
      <>
        <Field label="First" />
        <Field label="Second" />
      </>,
    );
    expect(screen.getByLabelText("First").id).not.toBe(
      screen.getByLabelText("Second").id,
    );
  });
});

describe("DataTable", () => {
  const rows = [
    { id: "1", name: "Ana Ruiz", phone: "5558675309" },
    { id: "2", name: "Sam Ortiz", phone: "5553334444" },
  ];
  const columns = [
    { key: "name", header: "Caller", render: (r: (typeof rows)[0]) => r.name },
    { key: "phone", header: "Callback", render: (r: (typeof rows)[0]) => r.phone },
  ];

  it("gives every column header a scope", () => {
    // Without scope, a screen reader announces cell contents with no idea
    // which column they belong to — the densest surface in the portal.
    render(
      <DataTable caption="Captured leads" columns={columns} rows={rows} rowKey={(r) => r.id} />,
    );
    const headers = screen.getAllByRole("columnheader");
    expect(headers).toHaveLength(2);
    headers.forEach((h) => expect(h).toHaveAttribute("scope", "col"));
  });

  it("exposes an accessible name via the caption", () => {
    render(
      <DataTable caption="Captured leads, newest first" columns={columns} rows={rows} rowKey={(r) => r.id} />,
    );
    expect(screen.getByRole("table", { name: /Captured leads/ })).toBeInTheDocument();
  });

  it("renders one row per record", () => {
    render(
      <DataTable caption="Leads" columns={columns} rows={rows} rowKey={(r) => r.id} />,
    );
    expect(screen.getAllByRole("row")).toHaveLength(3); // header + 2
  });

  it("shows an empty state instead of an empty table", () => {
    render(
      <DataTable
        caption="Leads"
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        empty="No leads captured yet."
      />,
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("No leads captured yet.")).toBeInTheDocument();
  });
});

describe("StatGrid", () => {
  it("emits valid definition-list markup", () => {
    // Each dt/dd pair shares one wrapper div, which is what the <dl> content
    // model requires. Splitting them across wrappers is invalid and is what
    // axe flagged in an earlier build.
    const { container } = render(
      <StatGrid
        items={[
          { label: "Calls captured", value: "42" },
          { label: "Critical", value: "3" },
        ]}
      />,
    );
    const dl = container.querySelector("dl");
    expect(dl).toBeInTheDocument();
    expect(dl?.querySelectorAll("dt")).toHaveLength(2);
    expect(dl?.querySelectorAll("dd")).toHaveLength(2);

    for (const dt of Array.from(dl!.querySelectorAll("dt"))) {
      const parent = dt.parentElement!;
      expect(parent.querySelectorAll("dd")).toHaveLength(1);
    }
  });
});
