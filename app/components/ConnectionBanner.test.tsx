import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConnectionBanner } from "@/app/components/ConnectionBanner";

describe("ConnectionBanner", () => {
  it("renders nothing when connected", () => {
    const { container } = render(<ConnectionBanner connected={true} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("shows a message when disconnected", () => {
    render(<ConnectionBanner connected={false} />);
    expect(screen.getByText(/verbinding met huis kwijt/i)).toBeInTheDocument();
  });
});
